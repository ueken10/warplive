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
} from "./config.js";
import { VrmViewer } from "./vrm-viewer.js";

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
  setStatus('○ 待機中 — 「ねえ、リリ」と話しかけてください');

  // 3Dアバター初期化（非同期）
  initVrmViewer().then(() => {
    console.log("[WarpLive] Phase 2 初期化完了");
  });
}

// DOM読込完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}