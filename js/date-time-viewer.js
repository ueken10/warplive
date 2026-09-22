/**
 * WarpLive - date-time-viewer.js
 * Three.js で日付・時刻とサイバーパンク風立体を表示するビューア
 *
 * Phase 2+: 機能選択「日時表示」用
 *  - VrmViewer と同じ canvas / scene / camera / renderer を共有
 *  - 緑色のテキスト（日付・時刻）を CanvasTexture + Sprite で表示
 *  - 回転するワイヤーフレーム立体を緑色で表示
 *  - 背景は共有レンダラーの黒背景を流用
 */

import * as THREE from "three";

/**
 * 日時表示ビューア
 */
export class DateTimeViewer {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, camera, renderer) {
    /** @type {THREE.Scene} */
    this.scene = scene;
    /** @type {THREE.Camera} */
    this.camera = camera;
    /** @type {THREE.WebGLRenderer} */
    this.renderer = renderer;

    /** @type {THREE.Group} */
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 日付・時刻テキスト用キャンバス
    this.textCanvas = document.createElement("canvas");
    this.textCanvas.width = 640;
    this.textCanvas.height = 320;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = /** @type {CanvasRenderingContext2D} */ (this.textCanvas.getContext("2d"));

    this.texture = new THREE.CanvasTexture(this.textCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
    });
    this.textSprite = new THREE.Sprite(spriteMaterial);
    this.textSprite.scale.set(1.5, 0.75, 1);
    this.textSprite.position.set(0, 1.0, 0);
    this.group.add(this.textSprite);

    // 回転するサイバーパンク風立体
    this.shapeGroup = new THREE.Group();
    this.shapeGroup.position.set(0, 0.25, 0);
    this.shapeGroup.scale.set(0.35, 0.35, 0.35);
    this.group.add(this.shapeGroup);

    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });

    this.innerShape = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 0),
      wireframeMaterial
    );
    this.shapeGroup.add(this.innerShape);

    this.outerShape = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.75, 0.06, 128, 16),
      wireframeMaterial
    );
    this.shapeGroup.add(this.outerShape);

    // 装飾リング
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.01, 16, 100), ringMaterial);
    this.ring.rotation.x = Math.PI / 2;
    this.shapeGroup.add(this.ring);

    /** @type {string} 前回描画した文字列 */
    this.lastText = "";

    // 初期状態は非表示
    this.group.visible = false;
  }

  /** 日時表示を表示 */
  show() {
    this.group.visible = true;
    this.lastText = "";
    this._drawText();
  }

  /** 日時表示を非表示 */
  hide() {
    this.group.visible = false;
  }

  /**
   * テキストを再描画
   * @param {boolean} force 強制的に再描画するか
   */
  _drawText(force = false) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    const timeStr = now.toLocaleTimeString("ja-JP", { hour12: false });
    const text = `${dateStr}\n${timeStr}`;

    if (!force && text === this.lastText) return;
    this.lastText = text;

    const ctx = this.ctx;
    const w = this.textCanvas.width;
    const h = this.textCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // サイバーパンク風グロー効果
    ctx.shadowColor = "#00ff00";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#00ff00";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = 'bold 52px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(dateStr, w / 2, h * 0.32);

    ctx.font = 'bold 96px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(timeStr, w / 2, h * 0.68);

    // セパレータライン
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.55);
    ctx.lineTo(w * 0.8, h * 0.55);
    ctx.lineWidth = 3;
    ctx.stroke();

    this.texture.needsUpdate = true;
  }

  /**
   * 毎フレーム更新
   * @param {number} deltaSec 前フレームからの経過秒
   */
  update(deltaSec) {
    if (!this.group.visible) return;

    this._drawText();

    this.innerShape.rotation.x += deltaSec * 0.6;
    this.innerShape.rotation.y += deltaSec * 0.8;

    this.outerShape.rotation.x -= deltaSec * 0.35;
    this.outerShape.rotation.y += deltaSec * 0.45;
    this.outerShape.rotation.z += deltaSec * 0.25;

    this.ring.rotation.x = Math.PI / 2 + Math.sin(performance.now() * 0.001) * 0.3;
    this.ring.rotation.y += deltaSec * 0.2;

    this.renderer.render(this.scene, this.camera);
  }
}
