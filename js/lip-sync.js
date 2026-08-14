/**
 * WarpLive - lip-sync.js
 * AI応答音声の振幅を解析し、VRM口形状（`aa`）にマッピングする
 *
 * spec.md 2.2.3節準拠:
 *  - AnalyserNode.getByteTimeDomainData() で波形から振幅取得（FFT不使用）
 *  - fftSize: 1024
 *  - 解析頻度: requestAnimationFrame 毎（目標60fps、モバイル30fps許容）
 *  - 24kHz PCM → AudioBufferSourceNode 再生時にブラウザ自動リサンプリング
 *  - 振幅の絶対値 → vrm.expressionManager.setValue('aa', value)
 *  - lerpスムージング（係数 0.3〜0.5）
 *  - 対象状態: AI応答中（Live API音声再生中）のみ。
 *    ユーザー発話中・対話アイドル中・ウェイクワード待機中は aa=0
 */

import { LIP_SYNC_FFT_SIZE, LIP_SYNC_SMOOTHING, LIP_SYNC_AMPLITUDE_GAIN } from "./config.js";

/**
 * @typedef {Object} LipSyncOptions
 * @property {number} [fftSize]     AnalyserNodeのfftSize（デフォルト: 1024）
 * @property {number} [smoothing]   lerp係数 0.3〜0.5（デフォルト: 0.4）
 * @property {number} [amplitudeGain] 振幅の増幅係数（デフォルト: 1.5）
 */

export class LipSync {
  /**
   * @param {import("./vrm-viewer.js").VrmViewer} vrmViewer  VRM参照用
   * @param {LipSyncOptions} [options]
   */
  constructor(vrmViewer, options = {}) {
    /** @type {import("./vrm-viewer.js").VrmViewer|null} */
    this.vrmViewer = vrmViewer;

    /** @type {AnalyserNode|null} */
    this.analyser = null;

    /** @type {Uint8Array|null} 波形データ格納用 */
    this.timeDomainData = null;

    /** @type {number} 現在の aa 値（0〜1） */
    this.currentAa = 0;

    /** @type {number} 目標 aa 値（0〜1） */
    this.targetAa = 0;

    /** @type {number} lerp係数 */
    this.smoothing = options.smoothing ?? LIP_SYNC_SMOOTHING;

    /** @type {number} 振幅増幅係数 */
    this.amplitudeGain = options.amplitudeGain ?? LIP_SYNC_AMPLITUDE_GAIN;

    /** @type {number} fftSize */
    this.fftSize = options.fftSize ?? LIP_SYNC_FFT_SIZE;

    /** @type {boolean} リップシンク動作中か */
    this.active = false;

    /** @type {boolean} RAFループ実行中か（フェードアウト含む） */
    this.running = false;

    /** @type {number|null} requestAnimationFrame ID */
    this.rafId = null;
  }

  /* =======================================================================
   * AnalyserNode 接続
   * ======================================================================= */

  /**
   * AnalyserNodeを音声再生チェーンにタップ接続する
   * 音声は sourceNode → destination で再生されつつ、sourceNode → analyser で解析する
   * （analyser は destination に接続しない＝音声出力に影響しない）
   *
   * @param {AudioContext} audioContext  音声再生用AudioContext
   * @param {AudioNode} sourceNode       解析元ノード（通常は playbackGainNode）
   */
  attach(audioContext, sourceNode) {
    // 既存のanalyserがあれば破棄
    this.detach();

    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.6; // 波形の時間的平滑化
    this.timeDomainData = new Uint8Array(this.analyser.fftSize);

    // タップ接続: sourceNode → analyser（analyserはdestinationに接続しない）
    sourceNode.connect(this.analyser);
    console.log("[LipSync] AnalyserNode接続 (fftSize:", this.fftSize, ")");
  }

  /* =======================================================================
   * リップシンク開始・停止
   * ======================================================================= */

  /**
   * リップシンク開始（AI応答音声再生開始時に呼ぶ）
   */
  start() {
    if (this.active) return;
    if (!this.analyser) {
      console.warn("[LipSync] AnalyserNode未接続 — start()無視");
      return;
    }
    this.active = true;
    console.log("[LipSync] リップシンク開始");
    this._kickLoop();
  }

  /**
   * リップシンク停止（AI応答終了・interrupted・セッション切断時に呼ぶ）
   * 即座に aa=0 にするのではなく、フェードアウトで徐々に閉じる（クローズドマウス）
   */
  stop() {
    if (!this.active && !this.running) return;
    this.active = false;
    this.targetAa = 0;
    console.log("[LipSync] リップシンク停止（フェードアウト）");
    // ループは currentAa が 0 に近づくまで継続（_loop内で停止判定）
    this._kickLoop();
  }

  /* =======================================================================
   * 振幅解析ループ
   * ======================================================================= */

  /** RAFループを開始（既に実行中なら何もしない） */
  _kickLoop() {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  /** 毎フレームの振幅解析・マッピング */
  _loop() {
    if (!this.analyser || !this.timeDomainData) {
      this.running = false;
      this.rafId = null;
      return;
    }

    if (this.active) {
      // --- 解析中: 波形から振幅を計算 ---
      this.analyser.getByteTimeDomainData(this.timeDomainData);

      // 128（無音中央）からの最大偏差を振幅とする
      let maxDeviation = 0;
      for (let i = 0; i < this.timeDomainData.length; i++) {
        const deviation = Math.abs(this.timeDomainData[i] - 128);
        if (deviation > maxDeviation) maxDeviation = deviation;
      }

      // 0〜1に正規化 + 増幅係数適用
      const normalized = maxDeviation / 128;
      this.targetAa = Math.min(1, normalized * this.amplitudeGain);
    } else {
      // --- 停止中: クローズドマウスへ徐々に戻す ---
      this.targetAa = 0;
    }

    // lerpスムージング
    this.currentAa += (this.targetAa - this.currentAa) * this.smoothing;

    // VRMのexpressionManagerに適用
    this._applyToVrm(this.currentAa);

    // 停止中かつ aa がほぼ0ならループ終了
    if (!this.active && this.currentAa < 0.01) {
      this.currentAa = 0;
      this._applyToVrm(0);
      this.running = false;
      this.rafId = null;
      console.log("[LipSync] フェードアウト完了 — aa=0");
      return;
    }

    this.rafId = requestAnimationFrame(() => this._loop());
  }

  /* =======================================================================
   * VRMへの適用
   * ======================================================================= */

  /**
   * VRMのexpressionManagerに aa 値を設定
   * @param {number} value  0〜1
   */
  _applyToVrm(value) {
    const vrm = this.vrmViewer?.currentVrm;
    if (vrm?.expressionManager) {
      vrm.expressionManager.setValue("aa", value);
    }
  }

  /* =======================================================================
   * 破棄
   * ======================================================================= */

  /** AnalyserNodeを切断・破棄 */
  detach() {
    this.stop();
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // 既に切断済み
      }
      this.analyser = null;
      this.timeDomainData = null;
    }
    // aa を確実に0に
    this.currentAa = 0;
    this._applyToVrm(0);
  }
}