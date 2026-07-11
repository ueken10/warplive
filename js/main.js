/**
 * WarpLive - main.js
 * アプリ全体の初期化・状態管理・イベント統括
 *
 * Phase 1: 静的UIのイベントバインディングのみ
 * 後続フェーズで各モジュール（vrm-viewer, gemini-live 等）を初期化・連携
 */

import {
  DEFAULT_AVATAR_KEY,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_AVATAR,
  AVATARS,
  IDLE_TIMEOUT_SEC,
} from "./config.js";
import { VrmViewer } from "./vrm-viewer.js";
import { GeminiLive } from "./gemini-live.js";
import { WakeWordManager } from "./wake-word.js";

/**
 * アプリケーション状態
 * @typedef {Object} AppState
 * @property {string} apiKey       Gemini APIキー
 * @property {string} avatarKey   選択中アバターのキー
 * @property {string} language    選択中言語
 * @property {boolean} subtitleVisible 字幕表示ON/OFF
 * @property {boolean} clockVisible   時計表示ON/OFF
 * @property {boolean} menuOpen    メニュー開閉状態
 */

/** @type {AppState} */
const state = {
  apiKey: "",
  avatarKey: DEFAULT_AVATAR_KEY,
  language: DEFAULT_LANGUAGE,
  subtitleVisible: true,
  clockVisible: true,
  menuOpen: false,
};

/** @type {VrmViewer|null} */
let vrmViewer = null;

/** @type {GeminiLive|null} */
let geminiLive = null;

/** @type {WakeWordManager|null} */
let wakeWordManager = null;

/* =========================================================================
 * Phase 4: セッションライフサイクル
 * ========================================================================= */

/** @type {boolean} Live APIセッション中か */
let sessionActive = false;

/** @type {number|null} アイドルタイマーID */
let idleTimerId = null;

/** @type {MediaStream|null} マイクストリーム */
let micStream = null;

/** @type {AudioContext|null} マイク用AudioContext */
let micAudioContext = null;

/** @type {ScriptProcessorNode|null} PCMキャプチャ用ノード */
let micProcessor = null;

/** @type {GainNode|null} マイクゲイン（ミュート制御用） */
let micGainNode = null;

/** @type {SpeechSynthesisUtterance|null} 一時応答用 */
let interimUtterance = null;

/* =========================================================================
 * Phase 5: 音声再生
 * ========================================================================= */

/** @type {AudioContext|null} 音声再生用AudioContext */
let playbackAudioContext = null;

/** @type {AudioBufferSourceNode[]} 音声再生キュー */
let playbackSources = [];

/** @type {number} 次のチャンクの再生開始時刻（秒） */
let playbackNextTime = 0;

/** @type {GainNode|null} 音声再生用ゲインノード */
let playbackGainNode = null;

/* ----------------------------------------------------------------------
 * Phase 5: 音声再生関数
 * ---------------------------------------------------------------------- */

/**
 * 音声再生用AudioContextを初期化（初回呼び出し時）
 * @returns {AudioContext}
 */
function ensurePlaybackContext() {
  if (!playbackAudioContext) {
    playbackAudioContext = new AudioContext();
    playbackGainNode = playbackAudioContext.createGain();
    playbackGainNode.gain.value = 1.0;
    playbackGainNode.connect(playbackAudioContext.destination);
    playbackNextTime = 0;
    console.log("[WarpLive] 音声再生AudioContext初期化 (sampleRate:", playbackAudioContext.sampleRate, ")");
  }
  // resume（ブラウザの自動再生ポリシー対策）
  if (playbackAudioContext.state === "suspended") {
    playbackAudioContext.resume();
  }
  return playbackAudioContext;
}

/**
 * base64 PCM音声チャンクを再生
 * Gemini Live APIからは16kHz signed 16-bit PCMとして送信される
 * @param {string} base64Pcm  base64エンコード済みPCM
 */
function playAudioChunk(base64Pcm) {
  try {
    const ctx = ensurePlaybackContext();

    // base64 → ArrayBuffer
    const binaryString = atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Int16 PCM → Float32 に変換
    const sampleCount = Math.floor(len / 2);
    const pcm16 = new Int16Array(bytes.buffer, 0, sampleCount);
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    // AudioBuffer作成（24kHz → ctx.sampleRateにリサンプリングはブラウザが自動処理）
    // Gemini Live APIの出力音声は24kHz signed 16-bit PCM
    const srcSampleRate = 24000;
    const buffer = ctx.createBuffer(1, sampleCount, srcSampleRate);
    buffer.copyToChannel(float32, 0);

    // 再生スケジューリング
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackGainNode);

    // 連続再生: 前のチャンクの終了時刻が未来ならそこから、過去なら即時
    const now = ctx.currentTime;
    if (playbackNextTime < now) {
      playbackNextTime = now;
    }
    source.start(playbackNextTime);
    playbackNextTime += buffer.duration;

    // 再生終了時にキューから除去
    source.onended = () => {
      const idx = playbackSources.indexOf(source);
      if (idx >= 0) playbackSources.splice(idx, 1);
    };
    playbackSources.push(source);
  } catch (err) {
    console.error("[WarpLive] 音声再生エラー:", err);
  }
}

/**
 * 音声再生を停止（interrupted時・セッション終了時に呼ぶ）
 */
function stopPlayback() {
  for (const src of playbackSources) {
    try {
      src.stop();
    } catch {
      // 既に停止済み
    }
  }
  playbackSources = [];
  playbackNextTime = 0;
  console.log("[WarpLive] 音声再生停止");
}

/** @type {number|null} requestAnimationFrameのID */
let rafId = null;

/** @type {number} 前フレームのタイムスタンプ（ミリ秒） */
let lastFrameTime = 0;

/** DOM要素キャッシュ */
const els = {
  menuToggle: /** @type {HTMLButtonElement} */ (document.getElementById("menu-toggle")),
  menuPanel: /** @type {HTMLElement} */ (document.getElementById("menu-panel")),
  menuOverlay: /** @type {HTMLElement} */ (document.getElementById("menu-overlay")),
  fullscreenToggle: /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-toggle")),
  fullscreenButton: /** @type {HTMLButtonElement} */ (document.getElementById("fullscreen-button")),
  clock: /** @type {HTMLElement} */ (document.getElementById("clock")),
  clockToggle: /** @type {HTMLInputElement} */ (document.getElementById("clock-toggle")),
  subtitle: /** @type {HTMLElement} */ (document.getElementById("subtitle")),
  subtitleToggle: /** @type {HTMLInputElement} */ (document.getElementById("subtitle-toggle")),
  status: /** @type {HTMLElement} */ (document.getElementById("status")),
  apiKeyInput: /** @type {HTMLInputElement} */ (document.getElementById("api-key-input")),
  avatarSelect: /** @type {HTMLSelectElement} */ (document.getElementById("avatar-select")),
  languageSelect: /** @type {HTMLSelectElement} */ (document.getElementById("language-select")),
  micButton: /** @type {HTMLButtonElement} */ (document.getElementById("mic-button")),
};

/* =========================================================================
 * ローカルストレージ読み書き
 * ========================================================================= */

/**
 * ローカルストレージから値を取得
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
function loadStorage(key, defaultValue) {
  try {
    return localStorage.getItem(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * ローカルストレージに値を保存
 * @param {string} key
 * @param {string} value
 */
function saveStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // プライベートモード等では無視
  }
}

/* =========================================================================
 * 時計
 * ========================================================================= */

/** 時計更新（1秒ごと） */
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  els.clock.textContent = `${hh}:${mm}`;
}

/* =========================================================================
 * フルスクリーン
 * ========================================================================= */

/** フルスクリーン切替 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      // 失敗時は無視
    });
  } else {
    document.exitFullscreen().catch(() => {
      // 失敗時は無視
    });
  }
}

/* =========================================================================
 * メニュー開閉
 * ========================================================================= */

/** メニューを開く */
function openMenu() {
  state.menuOpen = true;
  els.menuPanel.classList.add("open");
  els.menuPanel.setAttribute("aria-hidden", "false");
  els.menuOverlay.classList.add("visible");
  els.menuOverlay.setAttribute("aria-hidden", "false");
  els.menuToggle.classList.add("active");
}

/** メニューを閉じる */
function closeMenu() {
  state.menuOpen = false;
  els.menuPanel.classList.remove("open");
  els.menuPanel.setAttribute("aria-hidden", "true");
  els.menuOverlay.classList.remove("visible");
  els.menuOverlay.setAttribute("aria-hidden", "true");
  els.menuToggle.classList.remove("active");
}

/** メニュー開閉トグル */
function toggleMenu() {
  if (state.menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

/* =========================================================================
 * 字幕・時計 表示切替
 * ========================================================================= */

/** 字幕表示ON/OFF */
function setSubtitleVisible(visible) {
  state.subtitleVisible = visible;
  els.subtitle.classList.toggle("hidden", !visible);
  els.subtitleToggle.checked = visible;
}

/** 時計表示ON/OFF */
function setClockVisible(visible) {
  state.clockVisible = visible;
  els.clock.classList.toggle("hidden", !visible);
  els.clockToggle.checked = visible;
}

/* =========================================================================
 * ステータスインジケータ
 * ========================================================================= */

/**
 * ステータス表示を更新
 * @param {string} text
 */
function setStatus(text) {
  els.status.textContent = text;
}

/* =========================================================================
 * イベントバインディング
 * ========================================================================= */

function bindEvents() {
  // メニュー開閉
  els.menuToggle.addEventListener("click", toggleMenu);
  els.menuOverlay.addEventListener("click", closeMenu);

  // フルスクリーン
  els.fullscreenToggle.addEventListener("click", toggleFullscreen);
  els.fullscreenButton.addEventListener("click", () => {
    toggleFullscreen();
    closeMenu();
  });

  // APIキー入力
  els.apiKeyInput.addEventListener("change", () => {
    state.apiKey = els.apiKeyInput.value.trim();
    saveStorage(STORAGE_KEY_API_KEY, state.apiKey);
    if (state.apiKey) {
      // APIキーが入力されたらウェイクワード検出を開始
      wakeWordManager?.start();
    }
  });

  // アバター選択
  els.avatarSelect.addEventListener("change", () => {
    state.avatarKey = els.avatarSelect.value;
    saveStorage(STORAGE_KEY_AVATAR, state.avatarKey);
    // アバター切替
    const avatar = AVATARS[state.avatarKey];
    if (avatar && vrmViewer) {
      vrmViewer.switchAvatar(avatar.file).catch((err) => {
        console.error("[WarpLive] アバター切替エラー:", err);
        setStatus("⚠ エラー — VRMファイルの読み込みに失敗しました");
      });
    }
    // ウェイクワードも更新
    if (avatar && wakeWordManager) {
      wakeWordManager.setWakeWords(avatar.wakeWords);
      // ステータス表示も更新
      if (!sessionActive) {
        setStatus(`○ 待機中 — 「ねえ、${avatar.name.slice(-2)}」と話しかけてください`);
      }
    }
  });

  // 字幕トグル
  els.subtitleToggle.addEventListener("change", () => {
    setSubtitleVisible(els.subtitleToggle.checked);
  });

  // 時計トグル
  els.clockToggle.addEventListener("change", () => {
    setClockVisible(els.clockToggle.checked);
  });

  // 言語選択
  els.languageSelect.addEventListener("change", () => {
    state.language = els.languageSelect.value;
    saveStorage(STORAGE_KEY_LANGUAGE, state.language);
    // Phase 9で i18n.setLanguage() 等を呼び出し
  });

  // フォールバック用マイクボタン（Web Speech API非対応時）
  els.micButton.addEventListener("click", () => {
    if (sessionActive) {
      endLiveSession();
    } else {
      startLiveSession();
    }
  });
}

/* =========================================================================
 * Gemini Live API（Phase 3）
 * ========================================================================= */

/**
 * GeminiLiveインスタンスを作成し、コールバックを登録
 */
function initGeminiLive() {
  geminiLive = new GeminiLive();

  geminiLive.on({
    onSetupComplete: () => {
      console.log("[WarpLive] Gemini Live API setup完了");
      setStatus("● 接続中 — 話しかけてください");
      resetIdleTimer();
    },
    onAudioChunk: (base64Pcm) => {
      playAudioChunk(base64Pcm);
      resetIdleTimer();
    },
    onTranscription: (text) => {
      console.log("[WarpLive] transcription:", text);
      // Phase 6で字幕表示を実装
      resetIdleTimer();
    },
    onToolCall: (callId, name, args) => {
      console.log("[WarpLive] toolCall:", name, args);
      // Phase 7でファンクションコーリングを実装
    },
    onInterrupted: () => {
      console.log("[WarpLive] interrupted");
      stopPlayback();
    },
    onError: (msg) => {
      console.error("[WarpLive] GeminiLiveエラー:", msg);
      setStatus(`⚠ エラー — ${msg}`);
    },
  });
}

/* =========================================================================
 * Phase 4: ウェイクワード管理
 * ========================================================================= */

/**
 * WakeWordManagerを初期化し、コールバックを登録
 */
function initWakeWord() {
  wakeWordManager = new WakeWordManager();

  const avatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
  wakeWordManager.setWakeWords(avatar.wakeWords);
  wakeWordManager.setLanguage(state.language);

  wakeWordManager.on({
    onWakeWordDetected: (postWakeText) => {
      console.log("[WarpLive] ウェイクワード検出。バッファ:", postWakeText);
      handleWakeWordDetected(postWakeText);
    },
    onError: (msg) => {
      console.error("[WarpLive] ウェイクワードエラー:", msg);
      setStatus(`⚠ ${msg}`);
      // 致命的エラー時はフォールバックボタンを表示
      els.micButton.classList.remove("hidden");
    },
  });
}

/**
 * ウェイクワード検出時の処理
 * @param {string} postWakeText ウェイクワード以降のテキスト
 */
async function handleWakeWordDetected(postWakeText) {
  if (sessionActive) {
    console.log("[WarpLive] 既にセッション中 — ウェイクワード無視");
    return;
  }

  // 一時応答を即座に発話
  speakInterimResponse();

  setStatus("● 接続中 — Gemini Live APIに接続しています…");

  // セッション開始
  await startLiveSession();
}

/**
 * 一時応答をSpeechSynthesisで発話
 * ウェイクワード検出直後、Live API接続完了を待たずに即座に応答
 */
function speakInterimResponse() {
  const lang = state.language;
  const text = lang.startsWith("en") ? "Yes?" : "はい";

  interimUtterance = new SpeechSynthesisUtterance(text);
  interimUtterance.lang = lang;
  interimUtterance.rate = 1.1;
  interimUtterance.volume = 1.0;

  interimUtterance.onend = () => {
    interimUtterance = null;
  };

  window.speechSynthesis.speak(interimUtterance);
  console.log("[WarpLive] 一時応答発話:", text);
}

/* =========================================================================
 * Phase 4: マイクキャプチャ & PCM変換
 * ========================================================================= */

/**
 * マイクキャプチャを開始し、16kHz PCMデータを送信する
 * @returns {Promise<void>}
 */
async function startMicCapture() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    micAudioContext = new AudioContext();
    const source = micAudioContext.createMediaStreamSource(micStream);

    // ScriptProcessorNodeでPCMキャプチャ
    // bufferSize=4096, 1入力, 1出力
    micProcessor = micAudioContext.createScriptProcessor(4096, 1, 1);

    const inputSampleRate = micAudioContext.sampleRate;
    const targetSampleRate = 16000;

    micProcessor.onaudioprocess = (event) => {
      if (!sessionActive || !geminiLive?.connected) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // リサンプリング（inputSampleRate → 16kHz）
      const resampled = resampleTo16k(inputData, inputSampleRate, targetSampleRate);

      // Float32 → Int16 PCM変換
      const pcm16 = float32ToInt16(resampled);

      // Int16 → base64変換
      const base64 = arrayBufferToBase64(pcm16.buffer);

      // Live APIに送信
      geminiLive.sendAudioChunk(base64);
    };

    source.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    console.log("[WarpLive] マイクキャプチャ開始 (sampleRate:", inputSampleRate, ")");
  } catch (err) {
    console.error("[WarpLive] マイクキャプチャエラー:", err);
    throw err;
  }
}

/**
 * マイクキャプチャを停止
 */
function stopMicCapture() {
  if (micProcessor) {
    micProcessor.disconnect();
    micProcessor = null;
  }
  if (micAudioContext) {
    micAudioContext.close().catch(() => {});
    micAudioContext = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  console.log("[WarpLive] マイクキャプチャ停止");
}

/**
 * Float32 PCMデータを16kHzにリサンプリング
 * @param {Float32Array} input  入力PCMデータ
 * @param {number} fromRate     元のサンプルレート
 * @param {number} toRate       目標サンプルレート
 * @returns {Float32Array} リサンプリング済みデータ
 */
function resampleTo16k(input, fromRate, toRate) {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    result[i] = input[low] * (1 - frac) + input[high] * frac;
  }

  return result;
}

/**
 * Float32配列をInt16配列に変換
 * @param {Float32Array} float32
 * @returns {Int16Array}
 */
function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * ArrayBufferをbase64文字列に変換
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/* =========================================================================
 * Phase 4: アイドルタイマー管理
 * ========================================================================= */

/** アイドルタイマーをリセット（発話・応答のたびに呼び出す） */
function resetIdleTimer() {
  if (idleTimerId) {
    clearTimeout(idleTimerId);
  }
  idleTimerId = setTimeout(() => {
    console.log("[WarpLive] アイドルタイムアウト — セッション終了");
    endLiveSession();
  }, IDLE_TIMEOUT_SEC * 1000);
}

/** アイドルタイマーを停止 */
function stopIdleTimer() {
  if (idleTimerId) {
    clearTimeout(idleTimerId);
    idleTimerId = null;
  }
}

/* =========================================================================
 * Phase 4: セッションライフサイクル
 * ========================================================================= */

/**
 * Live APIセッションを開始
 * ウェイクワード検出時に呼ばれる
 */
async function startLiveSession() {
  if (sessionActive) return;

  if (!geminiLive) {
    initGeminiLive();
  }
  if (!state.apiKey) {
    setStatus("⚠ APIキーを入力してください");
    return;
  }

  const avatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];

  try {
    // マイクキャプチャ開始
    await startMicCapture();

    // Live API接続
    const connectPromise = geminiLive.connect(state.apiKey, {
      voice: avatar.voice,
      avatarName: avatar.name,
      language: state.language,
    });

    // 15秒のタイムアウト
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("接続タイムアウト（15秒）")), 15000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    sessionActive = true;
    console.log("[WarpLive] Live APIセッション開始");

    // アイドルタイマー開始
    resetIdleTimer();

    // ウェイクワード検出を停止（セッション中は不要）
    wakeWordManager?.stop();

    // マイクボタンのアクティブ状態更新
    els.micButton.classList.add("active");

    setStatus("● 接続中 — 話しかけてください");
  } catch (err) {
    console.error("[WarpLive] セッション開始エラー:", err);
    setStatus(`⚠ エラー — ${err.message}`);
    endLiveSession();
  }
}

/**
 * Live APIセッションを終了
 * アイドルタイムアウト時 or 手動終了時に呼ばれる
 */
function endLiveSession() {
  if (!sessionActive && !geminiLive?.connected) {
    // セッション未開始でもウェイクワード待機に戻る
    wakeWordManager?.reset();
    const fallbackAvatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
    setStatus(`○ 待機中 — 「ねえ、${fallbackAvatar.name.slice(-2)}」と話しかけてください`);
    return;
  }

  sessionActive = false;

  // アイドルタイマー停止
  stopIdleTimer();

  // 音声再生停止
  stopPlayback();

  // マイクキャプチャ停止
  stopMicCapture();

  // Live API切断
  geminiLive?.disconnect();

  // ウェイクワード検出を再開
  wakeWordManager?.reset();

  // マイクボタンのアクティブ状態更新
  els.micButton.classList.remove("active");

  // アバター名を反映したステータス表示
  const avatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
  setStatus(`○ 待機中 — 「ねえ、${avatar.name.slice(-2)}」と話しかけてください`);

  console.log("[WarpLive] セッション終了 — ウェイクワード待機に戻る");
}

/* =========================================================================
 * 3Dアバター（Phase 2）
 * ========================================================================= */

/** レンダリングループ */
function renderLoop(timestamp) {
  if (!vrmViewer) return;
  if (lastFrameTime === 0) lastFrameTime = timestamp;
  const deltaSec = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;
  vrmViewer.update(deltaSec);
  rafId = requestAnimationFrame(renderLoop);
}

/** 3Dアバターを初期化 */
async function initVrmViewer() {
  const canvas = document.getElementById("avatar-canvas");
  if (!canvas) {
    console.error("[WarpLive] avatar-canvas が見つかりません");
    return;
  }
  vrmViewer = new VrmViewer(canvas);

  // VRMAをプリロード
  try {
    await vrmViewer.preloadVrma();
  } catch (err) {
    console.warn("[WarpLive] VRMAプリロードで一部エラー:", err);
  }

  // デフォルトアバターをロード
  const avatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
  try {
    await vrmViewer.loadVRM(avatar.file);
    // リサイズを強制実行してカメラ構図を調整
    vrmViewer.onResize();
  } catch (err) {
    console.error("[WarpLive] VRMロードエラー:", err);
    setStatus("⚠ エラー — VRMファイルの読み込みに失敗しました");
    // デフォルトアバターにフォールバック
    if (state.avatarKey !== DEFAULT_AVATAR_KEY) {
      state.avatarKey = DEFAULT_AVATAR_KEY;
      els.avatarSelect.value = DEFAULT_AVATAR_KEY;
      try {
        await vrmViewer.loadVRM(AVATARS[DEFAULT_AVATAR_KEY].file);
      } catch (e) {
        console.error("[WarpLive] デフォルトVRMロードも失敗:", e);
      }
    }
  }

  // レンダリングループ開始
  lastFrameTime = 0;
  rafId = requestAnimationFrame(renderLoop);
}

/* =========================================================================
 * 初期化
 * ========================================================================= */

function init() {
  // 保存済み設定の読込
  state.apiKey = loadStorage(STORAGE_KEY_API_KEY, "");
  state.avatarKey = loadStorage(STORAGE_KEY_AVATAR, DEFAULT_AVATAR_KEY);
  state.language = loadStorage(STORAGE_KEY_LANGUAGE, DEFAULT_LANGUAGE);

  // UIに反映
  els.apiKeyInput.value = state.apiKey;
  if (els.avatarSelect.querySelector(`option[value="${state.avatarKey}"]`)) {
    els.avatarSelect.value = state.avatarKey;
  } else {
    els.avatarSelect.value = DEFAULT_AVATAR_KEY;
    state.avatarKey = DEFAULT_AVATAR_KEY;
  }
  if (els.languageSelect.querySelector(`option[value="${state.language}"]`)) {
    els.languageSelect.value = state.language;
  } else {
    els.languageSelect.value = DEFAULT_LANGUAGE;
    state.language = DEFAULT_LANGUAGE;
  }

  // 字幕・時計の初期表示状態
  setSubtitleVisible(state.subtitleVisible);
  setClockVisible(state.clockVisible);

  // イベントバインディング
  bindEvents();

  // 時計
  updateClock();
  setInterval(updateClock, 1000);

  // 初期ステータス
  const avatar = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
  setStatus(`○ 待機中 — 「ねえ、${avatar.name.slice(-2)}」と話しかけてください`);

  // 3Dアバター初期化（非同期）
  initVrmViewer().then(() => {
    console.log("[WarpLive] Phase 2 初期化完了");
  });

  // Gemini Live API初期化（Phase 3）
  initGeminiLive();

  // ウェイクワード検出開始（Phase 4）
  // ※ローカル認識なのでAPIキー不要
  initWakeWord();
  if (wakeWordManager.available) {
    wakeWordManager.start().then(() => {
      const avatar2 = AVATARS[state.avatarKey] || AVATARS[DEFAULT_AVATAR_KEY];
      setStatus(`○ 待機中 — 「ねえ、${avatar2.name.slice(-2)}」と話しかけてください`);
    }).catch((err) => {
      console.error("[WarpLive] ウェイクワード開始エラー:", err);
      els.micButton.classList.remove("hidden");
    });
  } else {
    console.warn("[WarpLive] Web Speech API未対応 — フォールバック: ボタンでセッション開始");
    setStatus("⚠ Web Speech API未対応 — マイクボタンを押して話してください");
    // マイクボタンを表示
    els.micButton.classList.remove("hidden");
  }
}

// DOM読込完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}