# 実装計画書

spec.mdに基づく3Dアバターアシスタント「WarpLive」の実装計画。

実装は10のフェーズに分け、各フェーズが前のフェーズに依存する構成とする。各フェーズ終了時に動作確認を行い、段階的に機能を積み上げる。

> **スコープ外機能（本計画では実装しない）**: spec.md 1.3節参照
> - VRMインポート
> - リップシンク
> - `get_current_time` 以外のファンクションコーリング（`get_weather`, `start_timer`, `set_alarm`, `start_pomodoro`, `play_janken`）
> - 日本語・英語以外の多言語対応
> - 無料枠警告
> - 能動的アクション

---

## Phase 1: プロジェクトスキャフォールド & 静的UI

**目標:** HTML/CSSの静的レイアウトを作成し、画面の骨組みを完成させる。

### タスク

- [ ] `index.html` 作成（`<script type="module">` で `js/main.js` を読み込み）
- [ ] `css/style.css` 作成
  - 黒背景フルスクリーンCanvas領域
  - ハンバーガーメニューボタン（左上）
  - フルスクリーンボタン（右上）
  - 時計表示領域（右上）
  - 字幕エリア（下部中央、半透明黒背景・白文字・最大2行）
  - ステータスインジケータ（最下部）
  - ハンバーガーメニューパネル（スライドイン式、設定項目の配置）
    - ※設定項目は spec.md 4.2節のスコープ内項目のみ（APIキー警告・APIキー入力・アバター選択・字幕表示・時計表示・言語選択[日/英のみ]・フルスクリーン）
  - レスポンシブ対応（スマホ縦・スマホ横・PC）
- [ ] `js/config.js` 作成（定数定義のみ、中身は空枠）
- [ ] `js/main.js` 作成（空の初期化関数のみ）
- [ ] 動作確認: ブラウザで `index.html` を開き、レイアウトが正しく表示される

### 成果物

```
index.html, css/style.css, js/config.js, js/main.js
```

---

## Phase 2: 3Dアバター表示

**目標:** Three.jsシーンを構築し、VRMアバターを表示し、VRMAアニメーションを再生する。

### タスク

- [ ] `js/config.js` に定数追加
  - Three.js / three-vrm / three-vrm-animation のCDN URL
  - アバターファイルパス（3体）
  - VRMAファイルパス（15種: VRMA_01〜07 + 001〜008）
  - 感情→VRMAマッピング表（neutral→VRMA_06, joy→VRMA_03, angry→007_gekirei, sorrow→005_smartphone, fun→VRMA_03, surprised→008_gatan, greeted→VRMA_02, sorry→002_dogeza）
  - 待機モーションプール（VRMA_01, VRMA_05, VRMA_07, 001_motion_pose, 003_humidai 計5種）
  - アバター別設定（名前・性別・ウェイクワード・ペルソナ・音声）
- [ ] `js/vrm-viewer.js` 作成
  - Three.jsシーン構築（シーン・カメラ・レンダラー・ライト）
  - 背景色 `0x000000`
  - GLTFLoader + VRMLoaderPlugin でVRMロード
  - VRMAnimationLoaderPlugin でVRMAロード
  - デフォルトアバター（`asaka_lily.vrm`）読み込み + 待機アニメーション再生
  - カメラ位置調整（全身が映る構図）
  - `resize` イベントでカメラ・レンダラーリサイズ
  - `requestAnimationFrame` でレンダリングループ
  - VRMAクロスフェード機能（0.3秒）
  - 待機モーションのランダム選択・連続再生管理（モーション終了時にプールからランダム選択、直前重複回避）
  - アバター切替メソッド（`switchAvatar(filename)`）
  - ※VRMインポートメソッド（`loadVRMFromFile(file)`）は **【スコープ外】** 実装しない
- [ ] `js/main.js` から `vrm-viewer.js` を初期化
- [ ] 動作確認: デフォルトアバターが表示され、待機アニメーションが再生される

### 成果物

```
js/vrm-viewer.js, js/config.js（更新）
```

---

## Phase 3: Gemini Live API 接続（基本）

**目標:** WebSocketでGemini Live APIに接続し、setup完了までの基本フローを実装する。

### タスク

- [ ] `js/gemini-live.js` 作成
  - `GeminiLive` クラス実装
  - `connect(apiKey)` メソッド: WebSocket接続開始
  - `setup()` メソッド: setupメッセージ送信（モデル名・音声・systemInstruction・tools・transcription設定）
  - `disconnect()` メソッド: WebSocket切断
  - メッセージ受信ハンドラ: `setupComplete`, `serverContent`, `toolCall`, `interrupted` の振り分け
  - コールバック登録機構（`onSetupComplete`, `onAudioChunk`, `onTranscription`, `onToolCall`, `onInterrupted`, `onError`）
  - `sendAudioChunk(base64Pcm)` メソッド: realtimeInput送信
  - `sendToolResponse(callId, name, response)` メソッド: toolResponse送信
- [ ] `js/config.js` にLive API関連定数追加
  - WebSocket URL
  - モデル名
  - system instructionテンプレート（`{name}` 変数含む）
  - functionDeclarations定義（※`get_current_time` のみ。他5関数は【スコープ外】）
- [ ] `js/main.js` にAPIキー入力UI処理追加（ローカルストレージ保存・読込）
- [ ] 動作確認: APIキーを入力し、setupCompleteが受信できることをコンソールで確認

### 成果物

```
js/gemini-live.js, js/config.js（更新）, js/main.js（更新）
```

---

## Phase 4: ウェイクワード検出 & セッションライフサイクル

**目標:** Web Speech APIで常時ローカル認識を行い、ウェイクワード検出時にLive APIセッションを開始・維持・切断するライフサイクルを実装する。

### タスク

- [x] `js/wake-word.js` 作成
  - [x] `WakeWordManager` クラス実装
  - [x] `SpeechRecognition` 初期化（`continuous: true`, `interimResults: true`, `lang: 'ja-JP'`）
  - [x] 選択中アバターのウェイクワードを取得して検出
  - [x] ウェイクワード検出時: `onWakeWordDetected` コールバック発火
  - [x] ウェイクワード以降の発話をバッファリング
  - [x] Web Speech API非対応時のフォールバックフラグ
- [x] `js/main.js` にセッションライフサイクル実装
  - [x] ウェイクワード検出 → `GeminiLive.connect()` → `setup()`
  - [x] マイク音声取得（`getUserMedia`）→ AudioWorklet/MediaRecorderで16kHz PCM化 → `sendAudioChunk()`
  - [x] アイドル8秒タイマー管理（発話検出で延長、タイムアウトで切断）
  - [x] セッション切断 → ウェイクワード待機に復帰
  - [x] ステータスインジケータ更新（待機中/接続中/応答中/エラー）
- [x] `js/config.js` に定数追加（アイドルタイムアウト値: 8秒）
- [x] 動作確認: 「ねえ、リリ」と話しかけるとセッションが開始し、アイドル8秒で切断される

### 成果物

```
js/wake-word.js, js/main.js（更新）, js/config.js（更新）
```

---

## Phase 5: 音声再生

**目標:** Live APIからの音声チャンクを再生する。

> **【スコープ外】** リップシンク（`js/lip-sync.js`、AnalyserNode → VRM blendShape `aa`）は本バージョンでは実装しない。音声再生のみ行う。

### タスク

- [x] `js/gemini-live.js` の `onAudioChunk` 処理を `js/main.js` に実装
  - PCMチャンク → AudioBuffer変換（16kHz → AudioContext サンプルレートにリサンプリング）
  - 順次再生キュー管理
  - `interrupted` 検出時: 再生キューをクリアし即座に停止
- [x] 動作確認: ウェイクワード後に話しかけると、AI音声が再生される

### 成果物

```
js/main.js（更新）
```

---

## Phase 6: 感情表現

**目標:** AI応答テキストから感情タグを抽出し、表情とアニメーションを切り替える。

### タスク

- [ ] `js/emotion.js` 作成
  - `parseEmotion(text)` 関数: 正規表現 `^\[(\w+)\]` で感情タグ抽出
  - `stripEmotionTag(text)` 関数: タグ除去後のテキストを返却
  - `applyEmotion(emotion, vrmViewer)` 関数: 感情 → VRM表情 + VRMAアニメーション切替
  - 対応感情タグ: `neutral`, `joy`, `angry`, `sorrow`, `fun`, `surprised`, `greeted`, `sorry`（8種）
  - 感情→表情・アニメーションマッピング（config.jsの定数を参照）
- [ ] `js/main.js` の `onTranscription` 処理に感情タグ解析を組み込み
  - 感情タグ抽出 → `applyEmotion()` 呼び出し
  - タグ除去テキスト → 字幕モジュールに渡す（Phase 7で実装）
  - アニメーション1ループ終了後 → 待機アニメーション（2.3.5参照）に戻る
- [ ] 動作確認: AI応答の感情タグに応じて、アバターの表情とアニメーションが変化する

### 成果物

```
js/emotion.js, js/main.js（更新）
```

---

## Phase 7: 字幕表示

**目標:** AI応答テキストを字幕として画面下部にストリーミング表示する。

### タスク

- [ ] `js/subtitles.js` 作成
  - `Subtitles` クラス実装
  - `show(text)` メソッド: 字幕エリアにテキスト表示
  - `append(text)` メソッド: ストリーミング表示用のテキスト追加
  - `clear()` メソッド: 字幕クリア
  - `setVisible(visible)` メソッド: 表示/非表示切替
  - 最大2行・長文スクロール処理
- [ ] `js/main.js` の `onTranscription` 処理に字幕表示を組み込み
  - 感情タグ除去済みテキストを `Subtitles.append()` に渡す
  - 発話完了時に字幕をクリア（または数秒後にフェードアウト）
- [ ] ハンバーガーメニューの字幕ON/OFFトグルを `Subtitles.setVisible()` に接続
- [ ] 動作確認: AI応答が字幕としてリアルタイム表示される

### 成果物

```
js/subtitles.js, js/main.js（更新）
```

---

## Phase 8: ファンクションコーリング

**目標:** `get_current_time` 関数呼び出しを実装する。

> **【スコープ外】** `get_weather`, `start_timer`, `set_alarm`, `start_pomodoro`, `play_janken` は本バージョンでは実装しない。

### タスク

- [ ] `js/functions.js` 作成
  - `FunctionHandler` クラス実装
  - `handleToolCall(call)` メソッド: 関数名に応じて分岐
  - **get_current_time**: `new Date()` → toolResponse返却
  - ※他5関数は実装しない
- [ ] `js/main.js` の `onToolCall` 処理から `FunctionHandler.handleToolCall()` を呼び出し
  - 結果を `GeminiLive.sendToolResponse()` で送信
- [ ] 動作確認: 「今何時」「何時」で `get_current_time` が呼び出され、時刻が応答される

### 成果物

```
js/functions.js, js/main.js（更新）
```

---

## Phase 9: 多言語対応（日本語・英語）

**目標:** UIラベルとAI言語を日本語・英語で切り替える。

> **【スコープ外】** 中国語・台湾華語・韓国語・マレー語・フィリピン語は本バージョンでは対応しない。

### タスク

- [ ] `js/i18n.js` 作成
  - 言語リソーステーブル（2言語 × 全UIラベル）
  - `setLanguage(lang)` メソッド: DOM要素のテキストを動的切替
  - `getCurrentLanguage()` メソッド
- [ ] `js/config.js` に言語→音声マッピング・言語→ウェイクワードマッピング追加
  - 言語→音声マッピング:
    - 日本語: アバター固有（リリ: Puck / エマ: Aoede / ルカ: Orus）
    - 英語: Charon
  - 言語→ウェイクワード・SpeechRecognition lang マッピング（2言語 × 3アバター）:
    - 日本語: ja-JP「ねえ、リリ」/「ねえ、エマ」/「ねえ、ルカ」
    - 英語: en-US「Hey Lily」/「Hey Emma」/「Hey Luca」
- [ ] `js/main.js` に言語切替処理追加
  - ハンバーガーメニューの言語選択（日本語/英語のみ） → `i18n.setLanguage()` 呼び出し
  - system instructionの言語切替
  - 音声マッピングの切替（次回セッション接続時に反映）
  - ウェイクワードの切替（言語ごとのウェイクワードをconfig.jsから取得 → `wakeWordManager.setWakeWords()` に反映）
  - `SpeechRecognition` の `lang` も選択言語に合わせて変更
  - 選択言語をローカルストレージに保存
- [ ] 動作確認: 言語を切り替えるとUI表示とAI応答言語が変更される

### 成果物

```
js/i18n.js, js/config.js（更新）, js/main.js（更新）
```

---

## Phase 10: UI機能（ハンバーガーメニュー・時計・フルスクリーン）

**目標:** 設定メニューのスコープ内機能を実装し、UIを完成させる。

> **【スコープ外】** VRMインポート・能動的アクショントグル・無料枠警告表示は実装しない。

### タスク

- [ ] ハンバーガーメニュー機能実装（`js/main.js`）
  - メニュー開閉アニメーション
  - APIキー警告表示（「APIキーはローカルでのみ使用し、公開しないでください」）
  - APIキー入力（ローカルストレージ保存・読込）
  - アバター選択セレクトボックス（3体のプリセットのみ） → `vrmViewer.switchAvatar()` 呼び出し
  - 字幕表示トグル → `Subtitles.setVisible()`
  - 時計表示トグル
  - 言語選択（日本語/英語のみ） → `i18n.setLanguage()`
  - フルスクリーンボタン → Fullscreen API (`document.documentElement.requestFullscreen()` / `document.exitFullscreen()`)
  - ※VRMインポート・能動的アクショントグル・無料枠警告表示は実装しない
- [ ] 時計表示実装
  - `setInterval` 1秒ごとに `HH:MM` 更新
  - トグルON/OFFで表示切替
- [ ] 動作確認: 全メニュー機能が動作する

### 成果物

```
js/main.js（更新）, css/style.css（更新）
```

---

## Phase 11: アバター切替の連動機能

**目標:** アバター切替時にウェイクワード・ペルソナ・音声が連動して変更される仕組みを完成させる。

### タスク

- [ ] `js/main.js` にアバター切替の統合処理を実装
  - アバター選択時の処理フロー:
    1. `vrmViewer.switchAvatar(filename)` で3Dアバター切替
    2. `config.js` のアバター別設定から名前・ウェイクワード・音声・ペルソナを取得
    3. `wakeWordManager.setWakeWords()` でウェイクワード更新
    4. system instructionの `{name}` を新しいアバター名で生成
    5. ステータスインジケータの表示を新しいアバター名で更新
    6. 次回Live APIセッション接続時に新しい音声・system instructionが反映されるよう設定
  - ※カスタムVRMインポートは【スコープ外】のため、プリセット3体のみ対応
- [ ] `js/wake-word.js` に `setWakeWords(words)` メソッド追加
- [ ] 動作確認: アバターを切り替えると、ウェイクワードとステータス表示が変更され、次回セッションで音声・ペルソナが反映される

### 成果物

```
js/main.js（更新）, js/wake-word.js（更新）
```

---

## Phase 12: エラー処理 & 最終調整

**目標:** 全エラーケースを処理し、製品品質を確保する。

> **【スコープ外】** 天気API取得失敗・無料枠超過エラーは実装しない（該当機能がスコープ外のため）。

### タスク

- [ ] エラー処理の実装
  - APIキー未設定時: ウェイクワード検出時にステータス表示、セッション開始せず
  - WebSocket接続失敗: ステータス表示、5秒後にウェイクワード待機に復帰
  - 予期せぬセッション切断: ステータス表示、ウェイクワード待機に復帰
  - マイク権限拒否: ステータス表示
  - Web Speech API非対応: フォールバックUI（タップ/ボタン押下でセッション開始）
  - VRMロード失敗: エラー表示、デフォルトアバターにフォールバック
  - ※天気API取得失敗・無料枠超過は【スコープ外】
- [ ] APIキー警告の常時表示（UI上）
- [ ] VRMAライセンスクレジット表記（About/クレジット画面またはフッター）
  - VRMA_01〜07: 「キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト」
  - 001〜008: CC0（へすい/rerofumi氏）、クレジット不要だが任意の表記を推奨
- [ ] 全体的な動作テスト
  - ウェイクワード → 対話 → アイドル切断のサイクル
  - アバター切替 → ウェイクワード変更 → 対話
  - `get_current_time` ファンクションコーリングの動作
  - 多言語切替（日本語/英語）
  - フルスクリーン切替
  - レスポンシブ表示（スマホ縦・横・PC）
- [ ] コードレビュー・JSDoc型情報の補完

### 成果物

```
js/main.js（更新）, js/gemini-live.js（更新）, js/vrm-viewer.js（更新）, css/style.css（更新）
```

---

## フェーズ依存関係

```
Phase 1 (スキャフォールド)
  ├─→ Phase 2 (3Dアバター)
  │     └─→ Phase 5 (音声再生) ─→ Phase 6 (感情表現)
  │                               └─→ Phase 7 (字幕)
  └─→ Phase 3 (Live API接続)
        └─→ Phase 4 (ウェイクワード)
              └─→ Phase 8 (ファンクションコーリング)
              └─→ Phase 9 (多言語: 日/英)
              └─→ Phase 10 (UI機能)
                    └─→ Phase 11 (アバター切替連動)
                          └─→ Phase 12 (エラー処理・調整）
```

> **【スコープ外】** リップシンク・能動的アクションは実装しない。

## 全体スケジュール目安

| フェーズ | 想定作業量 | 備考 |
| ---------- | ----------- | ------ |
| Phase 1 | 小 | HTML/CSSの静的レイアウト |
| Phase 2 | 大 | Three.js + VRMの初期表示。最も技術的に重い |
| Phase 3 | 中 | WebSocketプロトコルの実装 |
| Phase 4 | 中 | Web Speech API + セッションライフサイクル |
| Phase 5 | 小 | 音声再生のみ（リップシンクはスコープ外） |
| Phase 6 | 小 | 正規表現パース + マッピング |
| Phase 7 | 小 | DOM更新のみ |
| Phase 8 | 小 | `get_current_time` のみ実装 |
| Phase 9 | 小 | i18nテーブル管理（2言語: 日/英） |
| Phase 10 | 中 | UI機能の統合 |
| Phase 11 | 小 | 連動ロジックの実装 |
| Phase 12 | 中 | エラーケース網羅・最終テスト |

---

## 実装時の注意事項

1. **AGENT.md遵守**: Vanilla JavaScript（`.js`）、ビルドツール不使用、CDN import、JSDoc型情報
2. **段階的確認**: 各フェーズ終了時に必ずブラウザで動作確認を行う
3. **config.js一元管理**: モデル名・音声名・URL等の変更可能性のある値は全てconfig.jsに定義
4. **Live API仕様変更リスク**: プロトコル・音声名は2026年7月時点の仕様。実装時に最新ドキュメントを確認
5. **HTTPS必須**: マイク・Web Speech API使用のため。ローカル開発は `localhost` または `127.0.0.1`
6. **ブラウザ互換性**: Chrome系を主要ターゲット。Safari/FirefoxはフォールバックUIで対応
7. **スコープ外機能の遵守**: spec.md 1.3節に基づき、VRMインポート・リップシンク・`get_current_time` 以外のファンクションコーリング・日本語/英語以外の多言語対応・無料枠警告・能動的アクションは本バージョンでは実装しない
