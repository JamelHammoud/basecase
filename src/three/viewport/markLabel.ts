import * as THREE from 'three';
import { readableTextOn } from '../../utils/markColors';

const FONT_PX = 13;
const HEIGHT_PX = 24;
const PAD_X_PX = 9;
const GAP_PX = 8;
const MAX_CHARS = 48;
const TEXTURE_SCALE = 3;
const LABEL_ORDER = 1102;

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clipped = (text: string) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1).trimEnd()}…` : text);

function labelTexture(text: string, color: string): { texture: THREE.CanvasTexture; widthPx: number } {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  const font = `600 ${FONT_PX * TEXTURE_SCALE}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;

  g.font = font;

  const widthPx = Math.ceil(g.measureText(text).width / TEXTURE_SCALE) + PAD_X_PX * 2;

  canvas.width = widthPx * TEXTURE_SCALE;
  canvas.height = HEIGHT_PX * TEXTURE_SCALE;
  g.font = font;
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2);
  g.fill();
  g.fillStyle = readableTextOn(color);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + TEXTURE_SCALE);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return { texture, widthPx };
}

function topmostOnScreen(points: THREE.Vector3[], camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
  let best = -Infinity;
  const projected = new THREE.Vector3();

  for (const p of points) {
    projected.copy(p).project(camera);

    if (projected.z > 1 || projected.y <= best) continue;

    best = projected.y;
    out.copy(p);
  }

  return out;
}

export class MarkLabel {
  readonly sprite: THREE.Sprite;

  readonly widthPx: number;

  private rect: LabelRect | null = null;

  constructor(text: string, color: string, points: THREE.Vector3[]) {
    const { texture, widthPx } = labelTexture(clipped(text), color);
    const material = new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });

    this.widthPx = widthPx;
    this.sprite = new THREE.Sprite(material);
    this.sprite.center.set(0.5, -GAP_PX / HEIGHT_PX);
    this.sprite.renderOrder = LABEL_ORDER;
    this.sprite.frustumCulled = false;
    this.sprite.raycast = () => {};
    this.sprite.onBeforeRender = (renderer, _scene, camera) => this.place(renderer, camera, points);
  }

  hitRect(): LabelRect | null {
    return this.rect;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
  }

  private place(renderer: THREE.WebGLRenderer, camera: THREE.Camera, points: THREE.Vector3[]): void {
    const size = renderer.getSize(new THREE.Vector2());
    const focal = camera.projectionMatrix.elements[5];
    const anchor = topmostOnScreen(points, camera, this.sprite.position);
    const perPx = 2 / (size.y * focal);

    this.sprite.scale.set(this.widthPx * perPx, HEIGHT_PX * perPx, 1);
    this.sprite.updateMatrixWorld();
    this.sprite.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, this.sprite.matrixWorld);

    const screen = anchor.clone().project(camera);
    const x = ((screen.x + 1) / 2) * size.x;
    const y = ((1 - screen.y) / 2) * size.y;

    this.rect = { x: x - this.widthPx / 2, y: y - GAP_PX - HEIGHT_PX, width: this.widthPx, height: HEIGHT_PX };
  }
}
