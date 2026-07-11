/**
 * WarpLive - wake-word.js
 * Web Speech APIによるウェイクワード検出
 *
 * Phase 4: ウェイクワード検出 & セッションライフサイクル
 *  - SpeechRecognition 初期化（continuous: true, interimResults: true）
 *  - 選択中アバターのウェイクワードを検出
 *  - ウェイクワード検出時: onWakeWordDetected コールバック発火
 *  - ウェイクワード以降の発話をバッファリング
 *  - Web Speech API非対応時のフォールバックフラグ
 */

/**
 * @typedef {Object} WakeWordCallbacks
 * @property {function(string): void} [onWakeWordDetected] ウェイクワード検出時（バッファリング済みテキスト）
 * @property {function(string): void} [onInterimText]      中間結果テキスト（デバッグ/UI用）
 * @property {function(string): void} [onError]            エラー発生時
 */

export class WakeWordManager {
  constructor() {
    /** @type {SpeechRecognition|null} */
    this.recognition = null;

    /** @type {boolean} Web Speech APIが利用可能か */
    this.available = false;

    /** @type {boolean} 認識中か */
    this.listening = false;

    /** @type {string[]} 現在のウェイクワード配列 */
    this.wakeWords = [];

    /** @type {string} 認識言語 */
    this.lang = "ja-JP";

    /** @type {boolean} ウェイクワード検出済みか（バッファリング中フラグ） */
    this.wakeWordDetected = false;

    /** @type {string} ウェイクワード以降の発話バッファ */
    this.utteranceBuffer = "";

    /** @type {WakeWordCallbacks} */
    this.callbacks = {};

    /** @type {boolean} 致命的エラーで停止中か（自動再開しない） */
    this._fatalError = false;

    /** @type {boolean} 認識終了時に自動再開するか（stop()でfalse、start()でtrue） */
    this._shouldRestart = false;

    /** @type {number|null} 再開遅延タイマー */
    this._restartTimer = null;

    this._initRecognition();
  }

  /* =======================================================================
   * 初期化
   * ======================================================================= */

  /** SpeechRecognitionを初期化 */
  _initRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[WakeWord] Web Speech API未対応");
      this.available = false;
      return;
    }

    this.available = true;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.lang;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => this._onResult(event);
    this.recognition.onerror = (event) => this._onError(event);
    this.recognition.onend = () => this._onEnd();
    this.recognition.onstart = () => {
      console.log("[WakeWord] 認識開始");
      this.listening = true;
    };
  }

  /* =======================================================================
   * コールバック登録
   * ======================================================================= */

  /**
   * コールバックを登録
   * @param {WakeWordCallbacks} cbs
   */
  on(cbs) {
    Object.assign(this.callbacks, cbs);
  }

  /* =======================================================================
   * ウェイクワード設定
   * ======================================================================= */

  /**
   * ウェイクワード配列を設定
   * @param {string[]} words
   */
  setWakeWords(words) {
    // ひらがな・カタカナ両方に対応するため、正規化済みの配列を構築
    this.wakeWords = [];
    for (const w of words) {
      const lower = w.toLowerCase();
      this.wakeWords.push(lower);
      // カタカナ→ひらがな変換
      const hiragana = this._katakanaToHiragana(lower);
      if (hiragana !== lower) this.wakeWords.push(hiragana);
      // ひらがな→カタカナ変換
      const katakana = this._hiraganaToKatakana(lower);
      if (katakana !== lower) this.wakeWords.push(katakana);
    }
    // 重複除去
    this.wakeWords = [...new Set(this.wakeWords)];

    // 比較用に句読点・スペースを除去した正規化済み配列も構築
    this.wakeWordsNormalized = this.wakeWords.map((w) =>
      this._normalizeForMatch(w)
    );
    console.log("[WakeWord] ウェイクワード設定:", this.wakeWords);
    console.log("[WakeWord] 正規化済み:", this.wakeWordsNormalized);
  }

  /** カタカナ→ひらがな変換 */
  _katakanaToHiragana(str) {
    return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  /** ひらがな→カタカナ変換 */
  _hiraganaToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }

  /** 比較用正規化: 小文字化 + カタカナ→ひらがな + 句読点・スペース除去 */
  _normalizeForMatch(str) {
    return this._katakanaToHiragana(str.toLowerCase())
      .replace(/[、。・\s\u3000]/g, "");
  }

  /**
   * 認識言語を設定
   * @param {string} lang  言語コード（ja-JP, en-US等）
   */
  setLanguage(lang) {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  /* =======================================================================
   * 認識開始・停止
   * ======================================================================= */

  /** ウェイクワード検出を開始 */
  async start() {
    if (!this.available || !this.recognition) {
      console.warn("[WakeWord] Web Speech API利用不可");
      return;
    }
    if (this.listening) {
      console.log("[WakeWord] 既に認識中");
      return;
    }

    this.wakeWordDetected = false;
    this.utteranceBuffer = "";
    this._shouldRestart = true; // 自動再開を許可

    // マイク権限を明示的にリクエスト（SpeechRecognitionが音声を拾えない問題の対策）
    try {
      console.log("[WakeWord] マイク権限をリクエスト中...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 権限取得成功 → ストリームは即座に停止（SpeechRecognitionが独自にマイクを使用する）
      stream.getTracks().forEach((t) => t.stop());
      console.log("[WakeWord] マイク権限 OK");
    } catch (micErr) {
      console.error("[WakeWord] マイク権限エラー:", micErr);
      this._fatalError = true;
      this.callbacks.onError?.("マイクの使用が許可されていません");
      return;
    }

    try {
      this.recognition.start();
      console.log("[WakeWord] ウェイクワード検出開始");
    } catch (err) {
      console.error("[WakeWord] 認識開始エラー:", err);
      // 既に開始している場合は一度止めて再開
      if (err.name === "InvalidStateError") {
        this.recognition.stop();
        setTimeout(() => {
          try {
            this.recognition.start();
          } catch (e) {
            console.error("[WakeWord] 再開エラー:", e);
          }
        }, 100);
      }
    }
  }

  /** ウェイクワード検出を停止 */
  stop() {
    this._shouldRestart = false; // 自動再開を無効化
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // 既に停止している場合は無視
      }
    }
    this.listening = false;
    this.wakeWordDetected = false;
    this.utteranceBuffer = "";
    console.log("[WakeWord] ウェイクワード検出停止");
  }

  /**
   * セッション終了後、ウェイクワード待機に戻る
   * （バッファをクリアして再開）
   */
  async reset() {
    this.wakeWordDetected = false;
    this.utteranceBuffer = "";
    this._fatalError = false; // 致命的エラーフラグをリセット
    this._shouldRestart = true; // 自動再開を許可
    if (!this.listening) {
      await this.start();
    }
  }

  /* =======================================================================
   * 認識結果処理
   * ======================================================================= */

  /**
   * SpeechRecognition の onresult イベント処理
   * @param {SpeechRecognitionEvent} event
   */
  _onResult(event) {
    // 全resultを走査してトランスクリプトを構築
    // ※resultIndex以降だけでなく全結果を結合する
    let fullTranscript = "";
    let isFinal = false;

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      fullTranscript += transcript;
      if (result.isFinal) {
        isFinal = true;
      }
    }

    const normalizedText = fullTranscript.toLowerCase().trim();
    // 句読点・スペース・カタカナを正規化（「ねえ リリ」→「ねえりり」等）
    const normalizedForMatch = this._normalizeForMatch(normalizedText);
    console.log("[WakeWord] 認識結果:", normalizedText, "→正規化:", normalizedForMatch, "isFinal:", isFinal);

    // --- ウェイクワード未検出: ウェイクワードを探す ---
    if (!this.wakeWordDetected) {
      for (let wi = 0; wi < this.wakeWordsNormalized.length; wi++) {
        const normalizedWake = this.wakeWordsNormalized[wi];
        if (normalizedForMatch.includes(normalizedWake)) {
          console.log("[WakeWord] ウェイクワード検出:", this.wakeWords[wi]);
          this.wakeWordDetected = true;

          // ウェイクワード以降のテキストを抽出
          const wakeWordIndex = normalizedForMatch.indexOf(normalizedWake);
          const afterWakeWord = fullTranscript
            .substring(wakeWordIndex + normalizedWake.length)
            .trim();

          this.utteranceBuffer = afterWakeWord;

          // コールバック発火
          this.callbacks.onWakeWordDetected?.(afterWakeWord);
          return;
        }
      }
      // ウェイクワード未検出 → isFinal時に認識をリセットして蓄積を防ぐ
      if (isFinal) {
        this._restartRecognition();
      }
      return;
    }

    // --- ウェイクワード検出済み: 発話をバッファリング ---
    this.utteranceBuffer = fullTranscript.trim();
    this.callbacks.onInterimText?.(this.utteranceBuffer);
  }

  /* =======================================================================
   * 認識リセット
   * ======================================================================= */

  /**
   * 認識をリセットして再開する
   * continuous:true で結果が蓄積されるため、isFinal時にリセットする
   */
  _restartRecognition() {
    try {
      this.recognition.stop();
    } catch {
      // 既に停止済みの場合は無視
    }
    // onendで自動再開される（_shouldRestartはtrueのまま）
  }

  /* =======================================================================
   * エラー・終了処理
   * ======================================================================= */

  /**
   * SpeechRecognition の onerror イベント処理
   * @param {SpeechRecognitionErrorEvent} event
   */
  _onError(event) {
    const error = event.error;
    console.warn("[WakeWord] 認識エラー:", error);

    // no-speech は無視（マイク音声なし）
    if (error === "no-speech") {
      return;
    }

    // aborted も無視（stop()呼び出し時など）
    if (error === "aborted") {
      return;
    }

    // audio-capture は致命的
    if (error === "audio-capture") {
      this._fatalError = true;
      this.callbacks.onError?.("マイクにアクセスできません");
      return;
    }

    // not-allowed は致命的
    if (error === "not-allowed") {
      this._fatalError = true;
      this.callbacks.onError?.("マイクの使用が許可されていません");
      return;
    }

    // その他エラー
    this.callbacks.onError?.(`音声認識エラー: ${error}`);
  }

  /**
   * SpeechRecognition の onend イベント処理
   * 認識が終了したら自動的に再開する（continuous:true でも稀に終了するため）
   */
  _onEnd() {
    this.listening = false;

    // stop()で明示的に停止された場合は再開しない
    if (!this._shouldRestart) {
      console.log("[WakeWord] 認識終了（明示的停止のため再開しません）");
      return;
    }

    // 致命的エラーの場合は再開しない
    if (this._fatalError) {
      console.warn("[WakeWord] 致命的エラーのため再開しません");
      return;
    }

    console.log("[WakeWord] 認識終了（自動再開）");

    // 再開遅延（無限ループ防止）
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
    }
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      if (!this.listening && !this._fatalError) {
        this.start().catch((err) => {
          console.error("[WakeWord] 自動再開エラー:", err);
        });
      }
    }, 300);
  }
}
