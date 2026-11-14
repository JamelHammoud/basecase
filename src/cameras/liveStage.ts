import * as THREE from 'three';
import { placeCamera } from '../datasets/cameras';
import { applyDeltas, BACKGROUND, floor } from '../datasets/renderVideos';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { WorldLooks } from '../sim/worldLooks';
import { provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import { loadPartMeshes } from '../three/thumbnailRender';
import { softwareGl } from '../three/softwareGl';
import { createStudioScene } from '../three/thumbnailStage';
import type { ScenePart } from '../types/robotics';
import { LensRenderer } from './lensRender';
import { LiveLayer } from './liveLayer';
import type { CameraView } from './views';

export const TILE_SIZE: [number, number] = [320, 240];
export const LARGE_SIZE: [number, number] = [640, 480];

export interface LiveTarget {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

const EMPTY = new Map<string, THREE.Matrix4>();

const fits = (model: SimModel, poses: Float64Array) => poses.length === model.bodies.length * 7;

export class LiveStage {
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly lens: LensRenderer;

  private readonly parts: LiveLayer;

  private readonly world: LiveLayer;

  private model: SimModel | null = null;

  private views: CameraView[] = [];

  private sceneTicket = 0;

  constructor([width, height]: [number, number] = LARGE_SIZE) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: new OffscreenCanvas(width, height),
      antialias: !softwareGl(),
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.scene = createStudioScene(this.renderer);
    this.renderer.setClearColor(BACKGROUND, 1);
    this.scene.add(floor());
    this.lens = new LensRenderer(this.renderer);
    this.parts = new LiveLayer(this.scene);
    this.world = new LiveLayer(this.scene);
  }

  get canvas(): OffscreenCanvas {
    return this.renderer.domElement as unknown as OffscreenCanvas;
  }

  async setScene(parts: ScenePart[], world: ScenePart[], meshes?: MeshFiles): Promise<boolean> {
    const ticket = ++this.sceneTicket;

    provideMeshFiles(meshes);
    await loadPartMeshes([...this.parts.changed(parts), ...this.world.changed(world)]);

    if (ticket !== this.sceneTicket) return false;

    this.parts.sync(parts);
    this.world.sync(world);
    await this.lens.warm(this.scene).catch(() => undefined);

    return ticket === this.sceneTicket;
  }

  setModel(model: SimModel | null): void {
    if (model !== this.model) this.world.setLooks({});

    this.model = model;
  }

  setLooks(looks: WorldLooks): void {
    this.world.setLooks(looks);
  }

  setViews(views: CameraView[]): void {
    this.views = views;
  }

  draw(poses: Float64Array | null, targets: Map<string, LiveTarget>): number {
    const parts = this.pose(poses);
    let drawn = 0;

    for (const view of this.views) {
      const target = targets.get(view.key);

      if (!target) continue;

      this.paint(view, parts, target);
      drawn++;
    }

    return drawn;
  }

  drawView(poses: Float64Array | null, key: string, target: LiveTarget): boolean {
    const view = this.views.find((v) => v.key === key);

    if (!view) return false;

    this.paint(view, this.pose(poses), target);

    return true;
  }

  shoot(poses: Float64Array | null, keys: string[]): Record<string, ImageBitmap> {
    const parts = this.pose(poses);
    const out: Record<string, ImageBitmap> = {};

    for (const view of this.views.filter((v) => keys.includes(v.key))) {
      this.render(view, parts);
      out[view.key] = this.canvas.transferToImageBitmap();
    }

    return out;
  }

  dispose(): void {
    this.parts.dispose();
    this.world.dispose();
    this.lens.dispose();
    this.renderer.dispose();
  }

  private pose(poses: Float64Array | null): Map<string, THREE.Matrix4> {
    const model = this.model;

    if (!model || !poses || !fits(model, poses)) {
      applyDeltas(this.parts.items, EMPTY);
      applyDeltas(this.world.items, EMPTY);

      return EMPTY;
    }

    const parts = simDeltas(model, poses);

    applyDeltas(this.parts.items, parts);
    applyDeltas(this.world.items, worldDeltas(model, poses));

    return parts;
  }

  private paint(view: CameraView, parts: Map<string, THREE.Matrix4>, target: LiveTarget) {
    const gl = this.canvas;
    const width = Math.min(target.canvas.width, gl.width);
    const height = Math.min(target.canvas.height, gl.height);

    this.render(view, parts, { width, height });
    target.ctx.drawImage(gl, 0, gl.height - height, width, height, 0, 0, width, height);
  }

  private render(view: CameraView, parts: Map<string, THREE.Matrix4>, viewport?: { width: number; height: number }) {
    const delta = view.part ? parts.get(view.part) : undefined;

    this.lens.render(this.scene, { ...placeCamera(view, delta), lens: view.lens }, viewport);
  }
}
