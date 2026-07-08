# WarpLive

3Dアバター（VRM）と Gemini Live API を用いた音声対話アシスタント。

## 概要

- ブラウザ上で動作する3Dアバターアシスタント
- ウェイクワード「ねえ、リリ」で起動
- Gemini Live API による双方向音声対話
- 感情表現・字幕表示
- ファンクションコーリング（現在時刻取得）
- 2言語対応（日本語・英語）

> **スコープ外（本バージョンでは未実装）**: VRMインポート・リップシンク・`get_current_time` 以外のファンクションコーリング・日本語/英語以外の多言語対応・無料枠警告・能動的アクション（詳細は `spec.md` 1.3節参照）

## セットアップ

1. VRMファイルとVRMAファイルを `assets/` に配置（`assets/README.md` 参照）
2. ローカルサーバーで起動:

```bash
# Pythonの場合
python -m http.server 8000

# Node.jsの場合
npx serve
```

3. ブラウザで `http://localhost:8000` を開く
4. ハンバーガーメニューから Gemini APIキーを設定

## 必要環境

- モダンブラウザ（Chrome/Edge推奨）
- WebGL2対応
- Web Speech API（SpeechRecognition）対応
- マイクアクセス権限

## APIキーについて

- APIキーはローカルストレージに保存され、外部に送信されません
- APIキー設定欄の上に「APIキーはローカルでのみ使用し、公開しないでください」の警告を表示します

## ファイル構成

```
WarpLive/
├── index.html              # エントリポイント
├── css/
│   └── style.css           # スタイル
├── js/
│   ├── main.js             # エントリポイント・状態管理
│   ├── config.js           # 設定定数
│   ├── vrm-viewer.js       # VRM 3Dビューア
│   ├── gemini-live.js      # Gemini Live APIクライアント
│   ├── wake-word.js        # ウェイクワード検出
│   ├── emotion.js          # 感情表現
│   ├── subtitles.js        # 字幕表示
│   ├── functions.js        # ファンクションコーリング（get_current_timeのみ）
│   └── i18n.js             # 多言語対応（日本語・英語）
└── assets/
    ├── README.md           # アセット配置ガイド
    ├── *.vrm               # VRMファイル
    └── vrma/
        └── *.vrma          # VRMAファイル
```

> ※ `lip-sync.js`（リップシンク）・`proactive.js`（能動的アクション）は本バージョンでは未実装（スコープ外）

## クレジット

- キャラクターアニメーション: ピクシブ株式会社 VRoidプロジェクト
- モーションパック(001-008): へすい / rerofumi (CC0)