import * as THREE from 'three';
import type { Stage } from './stage';

const IDLE_REFRESH_MS = 1000;
const FRAME_ANIM_MS = 700;
const SPAWN_ANIM_MS = 420;

export interface FrameAnimation {
  start: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
}

const loadListeners = new Set<() => void>();

THREE.DefaultLoadingManager.onLoad = () => loadListeners.forEach((listener) => listener());

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const easeOutBack = (t: number) => {
  const c = 1.6;

  return t === 1 ? 1 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function fitKeyLight(stage: Stage, distance: number): void {
  const { keyLight, orbit } = stage;
  const half = Math.min(4000, Math.max(180, distance * 0.9));
  const shadow = keyLight.shadow.camera;

  if (Math.abs(shadow.right - half) > half * 0.15) {
    Object.assign(shadow, { left: -half, right: half, top: half, bottom: -half, far: Math.max(700, half * 5) });
    shadow.updateProjectionMatrix();
    keyLight.shadow.normalBias = ((2 * half) / keyLight.shadow.mapSize.width) * 1.5;
  }

  keyLight.position.set(orbit.target.x + half * 0.78, half * 1.45, orbit.target.z + half * 0.9);
  keyLight.target.position.set(orbit.target.x, 0, orbit.target.z);
  keyLight.target.updateMatrixWorld();
}

function followCamera(stage: Stage): void {
  const { camera, orbit, fillLight, grid } = stage;
  const distance = camera.position.distanceTo(orbit.target);

  grid.update(camera, orbit.target);
  fitKeyLight(stage, distance);
  fillLight.position.copy(camera.position).add(camera.up.clone().multiplyScalar(distance * 0.35));
  fillLight.target.position.copy(orbit.target);
  fillLight.target.updateMatrixWorld();
  camera.near = Math.max(0.5, distance / 400);
  camera.updateProjectionMatrix();
}

export class RenderLoop {
  paused = false;

  frameAnimation: FrameAnimation | null = null;

  readonly spawns = new Map<string, number>();

  private dirty = true;

  private frame = 0;

  private lastRender = 0;

  private readonly lastView = new THREE.Matrix4();

  private readonly stage: Stage;

  private readonly objectFor: (id: string) => THREE.Object3D | undefined;

  constructor(stage: Stage, objectFor: (id: string) => THREE.Object3D | undefined) {
    this.stage = stage;
    this.objectFor = objectFor;
  }

  start(): void {
    loadListeners.add(this.invalidate);

    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      this.step();
    };

    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    loadListeners.delete(this.invalidate);
    cancelAnimationFrame(this.frame);
  }

  invalidate = (): void => {
    this.dirty = true;
  };

  renderNow(): void {
    const { renderer, scene, camera } = this.stage;

    followCamera(this.stage);
    renderer.render(scene, camera);
    this.dirty = false;
    this.lastRender = performance.now();
    this.lastView.copy(camera.matrixWorld);
  }

  private step(): void {
    if (this.paused) {
      return;
    }

    const animating = this.stepFrameAnimation() || this.stepSpawns();
    const moved = this.stage.orbit.update();
    const stale = performance.now() - this.lastRender > IDLE_REFRESH_MS;
    const cameraMoved = !this.lastView.equals(this.stage.camera.matrixWorld);

    if (this.dirty || animating || moved || stale || cameraMoved) this.renderNow();
  }

  private stepFrameAnimation(): boolean {
    const anim = this.frameAnimation;

    if (!anim) {
      return false;
    }

    const t = Math.min(1, (performance.now() - anim.start) / FRAME_ANIM_MS);
    const e = easeInOutCubic(t);

    this.stage.orbit.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
    this.stage.camera.position.lerpVectors(anim.fromPos, anim.toPos, e);

    if (t >= 1) this.frameAnimation = null;

    return true;
  }

  private stepSpawns(): boolean {
    if (!this.spawns.size) {
      return false;
    }

    const now = performance.now();

    for (const [id, start] of this.spawns) {
      const t = Math.min(1, (now - start) / SPAWN_ANIM_MS);

      this.objectFor(id)?.scale.setScalar(Math.max(0.001, easeOutBack(t)));

      if (t >= 1) this.spawns.delete(id);
    }

    return true;
  }
}
