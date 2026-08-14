# 自作AIチャットボットの遅延と無反応を改善した話

## 1. はじめに

VRMアバターとGemini Live APIで音声対話できるWebアプリ「WarpLive」を作っている。

3Dアバターがマイクで話しかけたことに応答して、音声で返事をしてくれる。まるでGateboxみたいなやつ。趣味で作っている個人開発のやつだ。

でも、いざ動かしてみると「もっさり」「フリーズ」のオンパレード。

「ねえ、リリ」と話しかけてから返事が来るまでが遅い。そして10回くらい話すとAIがプツンと無反応になる。

仕方ないのでAI（GitHub Copilot）にボヤキながら付き合ってもらって直した記録を残す。

---

## 2. もっさり問題：AIの返事が遅い

ユーザーが話し終わってからAIが応答し始めるまで、体感5秒以上の空白。

「間が持たない」という致命的な問題。対話アプリにおいて「間」は死である。

### 原因１：VAD（音声検出）の無音待機時間が長すぎた？

Gemini Live APIにはVAD（Voice Activity Detection）という機能があって、ユーザーが話し終わったことを検出する。この「話し終わった」と判断するまでの無音待機時間が長すぎるのでは？と思った。

サーバーのデフォルトは約800ms。これを500msに短縮してみた。

```javascript
realtimeInputConfig: {
  automaticActivityDetection: {
    silenceDurationMs: 500,  // 800ms → 500ms
  },
},
```

結果：**大して改善しなかった。**

300ms早くなったところで、体感5秒の遅延は4.7秒になるだけ。意味がない。

### 原因２：gemini-2.5-flash-native-audio-latestが遅い

真の原因はモデル自体の応答速度だった。

使っていたのは `gemini-2.5-flash-native-audio-latest`。これがまた遅い。

#### 解決策２－１：thinkingLevel を minimal に

Gemini Live APIには `thinkingConfig` という設定があって、AIの「思考の深さ」を制御できる。デフォルトはそこそこ深く考えてから答える設定になっている。

```javascript
thinkingConfig: {
  thinkingLevel: "minimal",  // 思考を最小化
},
```

結果：**少し改善した。** でもまだ遅い。

#### 解決策２ー２：gemini-3.1-flash-live-preview に変更

思い切ってモデルを変えた。

```javascript
export const GEMINI_MODEL = "models/gemini-3.1-flash-live-preview";
```

結果：**劇的に改善した。**

体感5秒が体感1秒くらいになった。レイテンシ最小化に最適化された新しい世代のモデルらしい。さすがに最新版は違う。

教訓：**遅いと思ったら、まず最新版を試せ。**

---

## 3. 無反応問題：10回話すとAIが死ぬ

もっさり問題は解決した。快適に話せるようになった。

と思ったら、10回くらい対話するとAIがプツンと無反応になる。

何も反応しない。マイクは動いている。音声は送っている。でもAIから何も返ってこない。

そして30秒後に「待機中」に戻るという謎の現象。

「え、もう疲れたの？」とAIに心配する私。

---

## 4. 原因究明：コンテキストが満杯だった？

AI（Copilot）にコンソールログを見せながら原因調査をお願いした。

### 犯人：コンテキストウィンドウの枯渇？

音声データはトークン消費が大きい。10回対話するとコンテキストウィンドウが限界に達して、サーバーがセッションを強制切断しているのでは？という仮説。

さらに「切断してもアプリが気づかない」という二重苦。WebSocketが切れても `sessionActive = true` が残り続けて、30秒後にアイドルタイマーでようやく「待機中」に戻る仕組みだった。

### 解決策：contextWindowCompression を有効化

AI（Copilot）が提案してきた。

「`contextWindowCompression` を有効化しましょう」

```javascript
contextWindowCompression: {
  slidingWindow: { targetTokens: 4000 },
  triggerTokens: 8000,
},
```

スライディングウィンドウ方式で、古いコンテキストを自動破棄する仕組み。`systemInstruction`（ペルソナ）は保持されるので性格は維持されるらしい。

ついでに切断時リカバリーも実装した。`onclose` で `endLiveSession()` を呼べば、即座に「待機中」に戻れる。

### 結果：無反応問題は解決しなかった

**まだ死ぬ。**

コンテキスト圧縮を入れても、10回話すとAIが無反応になる現象は変わらなかった。

仮説が間違っていたらしい。

---

## 5. get_current_time が呼ばれない問題

原因究明のため、さらにログを詳しく見ることにした。

すると奇妙なことに気づいた。

ログを見ると `toolCall` が来ているのに `toolResponse` を返していない。

```
[GeminiLive] toolCall受信: get_current_time {}
[WarpLive] toolCall: get_current_time {}
// ...何も起きない...
```

AI（Copilot）が淡々と指摘してきた。

「`onToolCall` の実装が空ですよ」

```javascript
onToolCall: (callId, name, args) => {
  console.log("[WarpLive] toolCall:", name, args);
  // Phase 7でファンクションコーリングを実装  ← ここ
},
```

私「Phase 7で時刻回答のファンクションコーリングを実装するつもりだった…」

つまり、AIが「今何時？」と聞かれて `get_current_time` を呼び出しても、アプリ側が応答を返していなかった。AIは「関数の結果待ち」でずっと固まっていたのだ。

### 解決策：toolResponse を実装

`new Date()` で時刻を取得して `sendToolResponse()` で返却するようにした。

```javascript
onToolCall: (callId, name, args) => {
  console.log("[WarpLive] toolCall:", name, args);
  resetIdleTimer();

  if (name === "get_current_time") {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const response = { time: `${hours}:${minutes}` };
    geminiLive?.sendToolResponse(callId, name, response);
    console.log("[WarpLive] toolResponse送信:", response);
  }
},
```

これで「14時30分です」とAIが答えてくれるようになった。

### さらに無反応問題が解決

**これが本質だった。**

AI無反応の原因は、コンテキスト枯渇ではなく、`toolResponse` 未実装だった。

AIが `get_current_time` を呼び出す → アプリが応答を返さない → AIが「関数結果待ち」で固まる → 無反応

10回話すと無反応になるのは、10回の対話のどこかでAIが `get_current_time` を呼び出していたからだった。

コンテキスト圧縮は無駄だった。でもまあ、長時間対話の安定性向上にはなるので残しておく。

---

## 6. おわりに

結局、AI無反応の原因は2つ重なっていた。

1. **gemini live apiのバージョンが古かった**（遅延問題）
2. **`toolResponse` 未実装**（無反応問題）

AI（Copilot）は原因究明から実装まで丸投げできて便利。ログを貼り付ければ「ここが怪しい」「これを実装してください」と提案してくれる。

でも「原因を勘違い」「間違った修正」「料金高額化のリスク」等、人間が判断すべきこともある。

- コンテキスト枯渇が原因だと思い込んで無駄な修正をした
- `sessionResumption`（セッション再開）を実装すると料金が高額化するリスクがあったが、AIは「実装しましょう」と提案してきた。人間が「それはやらない」と判断した
- `inputAudioTranscription` で検証しようとしたが、サーバーが音声書き起こしを返さないモデルでは機能しなかった。AIの提案が通用しないケースもある

AIは便利だけど、鵜呑みにしないことが大事。

次は「感情タグでアバターの表情を変える」機能を実装したい。

でもその前に、そろそろ寝よう。