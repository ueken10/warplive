/**
 * WarpLive - gemini-live.js
 * Gemini Live API WebSocketクライアント
 *
 * Phase 3: 基本接続（connect / setup / disconnect）
 *  - WebSocket接続・切断
 *  - setup メッセージ送信（モデル・音声・systemInstruction・tools・transcription）
 *  - サーバーメッセージ受信・振り分け（setupComplete / serverContent / toolCall / interrupted）
 *  - コールバック登録機構
 *  - realtimeInput 送信（sendAudioChunk）
 *  - toolResponse 送信（sendToolResponse）
 */

import {
  GEMINI_LIVE_URL,
  GEMINI_MODEL,
  SYSTEM_INSTRUCTION_TEMPLATE,
  FUNCTION_DECLARATIONS,
} from "./config.js";

/**
 * @typedef {Object} GeminiLiveCallbacks
 * @property {function(): void}                          [onSetupComplete]   setupComplete受信時
 * @property {function(string): void}                    [onAudioChunk]      音声チャンク受信時（base64PCM）
 * @property {function(string): void}                    [onTranscription]   音声書き起こしテキスト受信時
 * @property {function(string, string, Object): void}    [onToolCall]        toolCall受信時（callId, name, args）
 * @property {function(): void}                          [onInterrupted]     interrupted受信時
 * @property {function(string): void}                    [onError]           エラー発生時
 */

export class GeminiLive {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;

    /** @type {boolean} 接続中フラグ */
    this.connected = false;

    /** @type {boolean} setup完了フラグ */
    this.setupDone = false;

    /** @type {GeminiLiveCallbacks} */
    this.callbacks = {};
  }

  /* =======================================================================
   * コールバック登録
   * ======================================================================= */

  /**
   * コールバックを登録
   * @param {GeminiLiveCallbacks} cbs
   */
  on(cbs) {
    Object.assign(this.callbacks, cbs);
  }

  /* =======================================================================
   * 接続・切断
   * ======================================================================= */

  /**
   * WebSocket接続を開始し、setup完了を待つ
   * @param {string} apiKey  Gemini APIキー
   * @param {Object} [options]
   * @param {string} [options.voice]      prebuilt voice名
   * @param {string} [options.avatarName] アバター名（systemInstructionの{name}に反映）
   * @param {string} [options.language]   言語コード（ja-JP等）
   * @returns {Promise<void>} setupComplete受信時にresolve
   */
  connect(apiKey, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.disconnect();
      }

      const url = `${GEMINI_LIVE_URL}?key=${encodeURIComponent(apiKey)}`;

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        const msg = `WebSocket作成失敗: ${err.message}`;
        console.error("[GeminiLive]", msg);
        this.callbacks.onError?.(msg);
        reject(new Error(msg));
        return;
      }

      this.connected = false;
      this.setupDone = false;

      let settled = false;

      this.ws.onopen = () => {
        console.log("[GeminiLive] WebSocket接続確立");
        this.connected = true;
        // setupメッセージを送信
        try {
          this._sendSetup(options);
        } catch (err) {
          const msg = `setup送信失敗: ${err.message}`;
          console.error("[GeminiLive]", msg);
          this.callbacks.onError?.(msg);
          if (!settled) {
            settled = true;
            reject(new Error(msg));
          }
        }
      };

      this.ws.onmessage = (event) => {
        // メッセージ受信をログに記録
        if (event.data instanceof Blob) {
          console.log("[GeminiLive] バイナリメッセージ受信 (size:", event.data.size, ")");
        } else if (event.data instanceof ArrayBuffer) {
          console.log("[GeminiLive] ArrayBufferメッセージ受信 (size:", event.data.byteLength, ")");
        } else {
          console.log("[GeminiLive] テキストメッセージ受信:", event.data.substring(0, 200));
        }
        this._handleMessage(event, () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        });
      };

      this.ws.onerror = (event) => {
        console.error("[GeminiLive] WebSocketエラー:", event);
        const msg = "WebSocketエラーが発生しました";
        this.callbacks.onError?.(msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };

      this.ws.onclose = (event) => {
        console.log("[GeminiLive] WebSocket切断:", event.code, event.reason);
        this.connected = false;
        this.setupDone = false;
        this.ws = null;
        if (!settled) {
          settled = true;
          const msg = `WebSocket接続が閉じられました (code: ${event.code}, reason: ${event.reason || "なし"})`;
          reject(new Error(msg));
        }
      };
    });
  }

  /**
   * WebSocket接続を切断
   */
  disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // 既に閉じている場合は無視
      }
      this.ws = null;
    }
    this.connected = false;
    this.setupDone = false;
  }

  /* =======================================================================
   * setup メッセージ送信
   * ======================================================================= */

  /**
   * setup メッセージをWebSocketで送信
   * @param {Object} [options]
   * @param {string} [options.voice]             prebuilt voice名
   * @param {string} [options.avatarName]        アバター名（systemInstructionの{name}に反映）
   * @param {string} [options.language]          言語コード（ja-JP等）
   */
  _sendSetup(options = {}) {
    const {
      voice = "Puck",
      avatarName = "浅香リリ",
      language = "ja-JP",
    } = options;

    // system instructionの{name}をアバター名に置換
    const systemInstructionText = SYSTEM_INSTRUCTION_TEMPLATE.replace(
      /\{name\}/g,
      avatarName
    );

    const setupMessage = {
      setup: {
        model: GEMINI_MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: FUNCTION_DECLARATIONS,
          },
        ],
      },
    };

    this._send(setupMessage);
    console.log("[GeminiLive] setup送信完了 (voice:", voice, ", avatar:", avatarName, ")");
  }

  /* =======================================================================
   * メッセージ送信
   * ======================================================================= */

  /**
   * 音声チャンクを送信（realtimeInput）
   * @param {string} base64Pcm  base64エンコード済みPCM音声データ
   */
  sendAudioChunk(base64Pcm) {
    if (!this.connected || !this.ws) {
      console.warn("[GeminiLive] 未接続のため音声送信不可");
      return;
    }

    const message = {
      realtimeInput: {
        audio: {
          data: base64Pcm,
          mimeType: "audio/pcm;rate=16000",
        },
      },
    };

    this._send(message);
  }

  /**
   * toolResponseを送信
   * @param {string} callId    toolCallのID
   * @param {string} name      関数名
   * @param {Object} response  関数の応答データ
   */
  sendToolResponse(callId, name, response) {
    if (!this.connected || !this.ws) {
      console.warn("[GeminiLive] 未接続のためtoolResponse送信不可");
      return;
    }

    const message = {
      toolResponse: {
        functionResponses: [
          {
            id: callId,
            name: name,
            response: response,
          },
        ],
      },
    };

    this._send(message);
    console.log("[GeminiLive] toolResponse送信:", name, response);
  }

  /**
   * JSONメッセージをWebSocketで送信
   * @param {Object} data
   */
  _send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[GeminiLive] WebSocket未接続");
      return;
    }
    this.ws.send(JSON.stringify(data));
  }

  /* =======================================================================
   * メッセージ受信ハンドラ
   * ======================================================================= */

  /**
   * WebSocketメッセージを処理
   * @param {MessageEvent} event
   * @param {function(): void} onSetupCompleteOnce  初回setupComplete時のコールバック
   */
  async _handleMessage(event, onSetupCompleteOnce) {
    let rawData = event.data;

    // Blob / ArrayBuffer を文字列に変換（まずJSONとして解析を試みる）
    if (rawData instanceof Blob) {
      const text = await rawData.text();
      try {
        const data = JSON.parse(text);
        this._processJsonMessage(data, onSetupCompleteOnce);
        return;
      } catch {
        // JSONでない → バイナリ音声データとして処理
        console.log("[GeminiLive] バイナリ音声チャンク (Blob size:", rawData.size, ")");
        const buffer = await rawData.arrayBuffer();
        const base64 = this._arrayBufferToBase64(buffer);
        this.callbacks.onAudioChunk?.(base64);
        return;
      }
    }

    if (rawData instanceof ArrayBuffer) {
      try {
        const text = new TextDecoder().decode(rawData);
        const data = JSON.parse(text);
        this._processJsonMessage(data, onSetupCompleteOnce);
        return;
      } catch {
        const base64 = this._arrayBufferToBase64(rawData);
        this.callbacks.onAudioChunk?.(base64);
        return;
      }
    }

    // テキストメッセージの処理
    try {
      const data = JSON.parse(rawData);
      this._processJsonMessage(data, onSetupCompleteOnce);
    } catch (err) {
      console.error("[GeminiLive] JSON解析エラー:", err, "data type:", typeof rawData);
    }
  }

  /**
   * ArrayBuffer → base64変換
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * JSONメッセージの処理
   * @param {Object} data
   * @param {function(): void} onSetupCompleteOnce
   */
  _processJsonMessage(data, onSetupCompleteOnce) {

    // --- setupComplete ---
    if (data.setupComplete) {
      console.log("[GeminiLive] setupComplete受信");
      this.setupDone = true;
      this.callbacks.onSetupComplete?.();
      onSetupCompleteOnce();
      return;
    }

    // --- serverContent ---
    if (data.serverContent) {
      const sc = data.serverContent;

      // 音声チャンク（旧仕様: audioChunk）
      if (sc.audioChunk) {
        const audioData = sc.audioChunk.data; // base64 PCM
        if (audioData) {
          console.log("[GeminiLive] audioChunk受信 (data length:", audioData.length, ")");
          this.callbacks.onAudioChunk?.(audioData);
        }
      }

      // modelTurn: テキスト + 音声（inlineData）
      if (sc.modelTurn?.parts) {
        for (const part of sc.modelTurn.parts) {
          // テキスト
          if (part.text) {
            this.callbacks.onTranscription?.(part.text);
          }
          // 音声データ（inlineData）
          if (part.inlineData) {
            const audioData = part.inlineData.data;
            if (audioData) {
              this.callbacks.onAudioChunk?.(audioData);
            }
          }
        }
      }

      // outputAudioTranscription
      if (sc.outputAudioTranscription?.text) {
        this.callbacks.onTranscription?.(sc.outputAudioTranscription.text);
      }

      // inputAudioTranscription
      if (sc.inputAudioTranscription?.text) {
        // ユーザー音声の書き起こし（デバッグ用、通常はUIに表示しない）
        console.log("[GeminiLive] inputTranscription:", sc.inputAudioTranscription.text);
      }

      return;
    }

    // --- toolCall ---
    if (data.toolCall) {
      const functionCalls = data.toolCall.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          console.log("[GeminiLive] toolCall受信:", fc.name, fc.args);
          this.callbacks.onToolCall?.(fc.id, fc.name, fc.args || {});
        }
      }
      return;
    }

    // --- interrupted ---
    if (data.interrupted) {
      console.log("[GeminiLive] interrupted受信");
      this.callbacks.onInterrupted?.();
      return;
    }

    // --- その他のメッセージ（デバッグログ） ---
    console.log("[GeminiLive] 未処理メッセージ:", data);
  }
}
