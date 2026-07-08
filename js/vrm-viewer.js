/**
 * WarpLive - vrm-viewer.js
 * Three.jsシーン構築・VRMロード・VRMAアニメーション再生・カメラ制御
 *
 * Phase 2: 3Dアバター表示
 *  - Three.jsシーン構築（シーン・カメラ・レンダラー・ライト）
 *  - GLTFLoader + VRMLoaderPlugin でVRMロード
 *  - VRMAnimationLoaderPlugin でVRMAロード
 *  - デフォルトアバター読み込み + 待機アニメーション再生
 *  - VRMAクロスフェード（0.3秒）
 *  - 待機モーションのランダム選択・連続再生管理
 *  - アバター切替メソッド（switchAvatar）
 *
 * ※VRMインポート（loadVRMFromFile）は【スコープ外】実装しない
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import {
  ASSETS_BASE,
  VRMA_PATHS,
  EMOTION_TO_VRMA,
  IDLE_MOTION_POOL,
  VRMA_CROSSFADE_SEC,
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_TARGET_HEIGHT,
} from "./config.js";

/**
 * VRMアニメーション再生状態
 * @typedef {Object} AnimationState
 * @property {string|null} currentVrmaKey  現在再生中のVRMAキー
 * @property {THREE.AnimationAction|null} currentAction 現在のAnimationAction
 * @property {THREE.AnimationAction|null} fadingAction  フェードアウト中のAction
 * @property {boolean} isIdle              待機モーション再生中か
 * @property {string|null} lastIdleKey     直前に再生した待機モーションキー（連続重複防止）
 */

export class VrmViewer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {THREE.Scene} */
    this.scene = new THREE.Scene();

    /** @type {THREE.PerspectiveCamera} */
    this.camera = new THREE.PerspectiveCamera(
      30,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );

    /** @type {THREE.WebGLRenderer} */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setClearColor(0x000000, 1.0);

    /** @type {THREE.Group} VRMモデルのルート */
    this.vrmRoot = new THREE.Group();
    this.scene.add(this.vrmRoot);

    /** @type {THREE.VRM|null} 現在ロード中のVRM */
    this.currentVrm = null;

    /** @type {THREE.AnimationMixer|null} */
    this.mixer = null;

    /** @type {Object<string, object>} VRMAキー → VRMAnimation（プリロード済み生データ） */
    this.vrmaAnimations = {};

    /** @type {Object<string, THREE.AnimationClip>} VRMAキー → AnimationClip（VRMロード後に変換済み） */
    this.vrmaClips = {};

    /** @type {AnimationState} */
    this.animState = {
      currentVrmaKey: null,
      currentAction: null,
      fadingAction: null,
      isIdle: false,
      lastIdleKey: null,
    };

    /** @type {boolean} 初期VRMロード完了フラグ */
    this.initialized = false;

    /** @type {boolean} VRMAプリロード完了フラグ */
    this.vrmaLoaded = false;

    this._setupLights();
    this._bindResize();
  }

  /* =======================================================================
   * ライト・シーン設定
   * ======================================================================= */

  /** 環境光 + 方向光のシンプル構成 */
  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(1.0, 1.0, 1.0).normalize();
    this.scene.add(directional);
  }

  /* =======================================================================
   * リサイズ
   * ======================================================================= */

  _bindResize() {
    window.addEventListener("resize", () => this.onResize());
  }

  /** Canvasサイズに合わせてカメラ・レンダラーをリサイズ */
  onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this._fitCameraToVrm();
  }

  /* =======================================================================
   * カメラ制御
   * ======================================================================= */

  /** VRMの全身が映るようカメラ位置・注視点を調整 */
  _fitCameraToVrm() {
    if (!this.currentVrm) {
      // デフォルト構図
      this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
      this.camera.lookAt(0, CAMERA_TARGET_HEIGHT, 0);
      return;
    }

    // VRMのバウンディングボックスから全身が映る構図を計算
    const box = new THREE.Box3().setFromObject(this.vrmRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const height = size.y || 1.5;
    const width = size.x || 0.5;

    // カメラの画角に基づき必要な距離を計算（縦・横の大きい方を採用）
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const distByHeight = height / 2 / Math.tan(fovRad / 2);
    const aspect = this.camera.aspect;
    const distByWidth = width / 2 / (Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distByHeight, distByWidth) * 1.1; // 余白分

    this.camera.position.set(
      center.x,
      center.y,
      center.z + dist
    );
    this.camera.lookAt(center.x, center.y, center.z);
  }

  /* =======================================================================
   * VRMロード
   * ======================================================================= */

  /**
   * VRMファイルをロード
   * @param {string} filename  assets/ 配下のファイル名
   * @returns {Promise<void>}
   */
  async loadVRM(filename) {
    const url = `${ASSETS_BASE}/${filename}`;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);

    // 既存VRMがあれば破棄
    if (this.currentVrm) {
      this.vrmRoot.clear();
      // 古いVRMの解放処理
      this.currentVrm.scene?.traverse((obj) => {
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
        if (obj.geometry) obj.geometry.dispose();
      });
      this.currentVrm = null;
    }

    const vrm = gltf.userData.vrm;
    this.vrmRoot.add(vrm.scene);
    this.currentVrm = vrm;

    // AnimationMixerを再作成
    this.mixer = new THREE.AnimationMixer(this.vrmRoot);

    // VRMAクリップをVRMに合わせて再変換
    this._convertVrmaAnimationsToClips();

    // カメラ構図調整
    this._fitCameraToVrm();

    if (!this.initialized) {
      this.initialized = true;
      // 初回ロード時は待機モーションを開始
      this.startIdleMotion();
    }
  }

  /**
   * アバターを切り替え
   * @param {string} filename  assets/ 配下のVRMファイル名
   * @returns {Promise<void>}
   */
  async switchAvatar(filename) {
    const wasIdle = this.animState.isIdle;
    // 現在のアニメーションを停止
    this._stopAllActions();
    await this.loadVRM(filename);
    // 切替後は待機モーションに復帰
    this.startIdleMotion();
  }

  /* =======================================================================
   * VRMAロード
   * ======================================================================= */

  /** 全VRMAファイルをプリロード（生のVRMAnimationオブジェクトを保存。AnimationClip変換はloadVRM後） */
  async preloadVrma() {
    if (this.vrmaLoaded) return;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    const keys = Object.keys(VRMA_PATHS);
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const gltf = await loader.loadAsync(VRMA_PATHS[key]);
        const vrmAnimations = gltf.userData.vrmAnimations;
        if (vrmAnimations && vrmAnimations.length > 0) {
          this.vrmaAnimations[key] = vrmAnimations[0];
        }
        return key;
      })
    );

    const failed = results
      .filter((r) => r.status === "rejected")
      .map((r, i) => keys[i]);
    if (failed.length > 0) {
      console.warn("[VrmViewer] VRMAロード失敗:", failed);
    }

    this.vrmaLoaded = true;
  }

  /**
   * プリロード済みVRMAnimationをAnimationClipに変換（VRMが必要）
   * VRMロード時・アバター切替時に呼び出す
   */
  _convertVrmaAnimationsToClips() {
    this.vrmaClips = {};
    if (!this.currentVrm) return;
    for (const [key, vrmAnimation] of Object.entries(this.vrmaAnimations)) {
      try {
        this.vrmaClips[key] = createVRMAnimationClip(vrmAnimation, this.currentVrm);
      } catch (e) {
        console.warn(`[VrmViewer] VRMA変換失敗 (${key}):`, e.message);
      }
    }
  }

  /** AnimationMixerの状態をリセット */
  _resetAnimState() {
    this.animState.currentAction = null;
    this.animState.fadingAction = null;
    this.animState.currentVrmaKey = null;
  }

  /* =======================================================================
   * アニメーション再生
   * ======================================================================= */

  /** 全Actionを停止 */
  _stopAllActions() {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.animState.currentAction = null;
    this.animState.fadingAction = null;
    this.animState.currentVrmaKey = null;
  }

  /**
   * 指定VRMAキーのアニメーションを1ループ再生（クロスフェード）
   * @param {string} vrmaKey  VRMA_PATHSのキー
   * @param {Object} [options]
   * @param {boolean} [options.loop=false]  ループ再生するか
   * @param {boolean} [options.isIdle=false] 待機モーションとして再生するか
   * @returns {THREE.AnimationAction|null}
   */
  playVrma(vrmaKey, options = {}) {
    const { loop = false, isIdle = false } = options;
    const clip = this.vrmaClips[vrmaKey];
    if (!clip || !this.mixer) {
      console.warn(`[VrmViewer] VRMA未ロードまたはmixer未準備: ${vrmaKey}`);
      return null;
    }

    // 新しいActionを作成
    const newAction = this.mixer.clipAction(clip);
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
    newAction.clampWhenFinished = !loop;
    newAction.reset();

    // クロスフェード
    const fadeSec = VRMA_CROSSFADE_SEC;
    if (this.animState.currentAction) {
      this.animState.currentAction.fadeOut(fadeSec);
      this.animState.fadingAction = this.animState.currentAction;
    }
    newAction.fadeIn(fadeSec).play();

    this.animState.currentAction = newAction;
    this.animState.currentVrmaKey = vrmaKey;
    this.animState.isIdle = isIdle;

    // 1ループ終了時のコールバック（LoopOnceの場合）
    if (!loop) {
      newAction.getMixer().addEventListener("finished", (e) => {
        if (e.action === newAction && this.animState.currentAction === newAction) {
          this._onAnimationFinished(vrmaKey, isIdle);
        }
      });
    }

    return newAction;
  }

  /**
   * アニメーション1ループ終了時の処理
   * @param {string} vrmaKey
   * @param {boolean} isIdle
   */
  _onAnimationFinished(vrmaKey, isIdle) {
    // 感情アニメーション終了後は待機モーションに復帰
    // 待機モーション終了後は次の待機モーションへ
    if (isIdle) {
      this._playNextIdle();
    } else {
      this.startIdleMotion();
    }
  }

  /* =======================================================================
   * 待機モーション管理
   * ======================================================================= */

  /** 待機モーションを開始（ランダム選択） */
  startIdleMotion() {
    this._playNextIdle(true);
  }

  /**
   * 次の待機モーションをランダム選択して再生
   * @param {boolean} [forceStart=false] 強制開始（初回等）
   */
  _playNextIdle(forceStart = false) {
    if (IDLE_MOTION_POOL.length === 0) return;

    let nextKey;
    if (IDLE_MOTION_POOL.length === 1) {
      nextKey = IDLE_MOTION_POOL[0];
    } else {
      // 直前と同じモーションは回避（連続重複防止）
      do {
        nextKey = IDLE_MOTION_POOL[Math.floor(Math.random() * IDLE_MOTION_POOL.length)];
      } while (nextKey === this.animState.lastIdleKey);
    }

    this.animState.lastIdleKey = nextKey;
    this.playVrma(nextKey, { loop: false, isIdle: true });
  }

  /* =======================================================================
   * 感情アニメーション
   * ======================================================================= */

  /**
   * 感情タグに対応するアニメーションを再生
   * @param {string} emotion  neutral/joy/angry/sorrow/fun/surprised/greeted
   */
  playEmotion(emotion) {
    const vrmaKey = EMOTION_TO_VRMA[emotion];
    if (!vrmaKey) {
      console.warn(`[VrmViewer] 未知の感情タグ: ${emotion}`);
      return;
    }
    this.playVrma(vrmaKey, { loop: false, isIdle: false });
  }

  /* =======================================================================
   * レンダリングループ
   * ======================================================================= */

  /**
   * 毎フレーム更新（外部のrequestAnimationFrameから呼び出し）
   * @param {number} deltaSec  前フレームからの経過秒
   */
  update(deltaSec) {
    if (this.mixer) {
      this.mixer.update(deltaSec);
    }
    // VRMの表情・spring bone更新
    if (this.currentVrm) {
      this.currentVrm.update(deltaSec);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
