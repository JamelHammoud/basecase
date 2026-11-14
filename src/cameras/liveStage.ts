import * as THREE from 'three';
import { placeCamera } from '../datasets/cameras';
import { applyDeltas, BACKGROUND, floor, posed, type Posed } from '../datasets/renderVideos';
import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import { releasePartGroup } from '../three/buildPartMesh';
import { provideMeshFiles, type MeshFiles } from '../three/componentMeshes';
import { loadPartMeshes } from '../three/thumbnailRender';
import { softwareGl } from '../three/softwareGl';
import { createStudioScene } from '../three/thumbnailStage';
import type { ScenePart } from '../types/robotics';
import { LensRenderer } from './lensRender';
import type { CameraView } from './views';
import { trainingJpeg } from './trainingImage';
import { projectTrainingPoints } from './trainingLabels';
import { TrainingPasses } from './trainingPasses';
import { TrainingSurfaces } from './trainingSurfaces';
import type { CameraTrainingFrame, CameraTrainingRequest } from './trainingTypes';
import { varyTrainingScene, varyTrainingShot } from './trainingVariation';

export const TILE_SIZE: [number, number] = [320, 240];
export const LARGE_SIZE: [number, number] = [640, 480];

export interface LiveTarget {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
}

export interface LiveJob {
  key: string;
  target: LiveTarget;
}

interface Built {
  part: ScenePart;
  posed: Posed;
}

const EMPTY = new Map<string, THREE.Matrix4>();

const fits = (model: SimModel, poses: Float64Array) => poses.length === model.bodies.length * 7;

class Layer {
  private readonly built = new Map<string, Built>();

  private readonly root = new THREE.Group();

  items: Posed[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  changed(parts: ScenePart[]): ScenePart[] {
    return parts.filter((p) => this.built.get(p.id)?.part !== p);
  }

  sync(parts: ScenePart[]): void {
    const byId = new Map(parts.map((p) => [p.id, p]));

    for (const [id, b] of this.built) {
      if (byId.get(id) === b.part) continue;

      b.posed.group.removeFromParent();
      releasePartGroup(b.posed.group);
      this.built.delete(id);
    }

    for (const part of parts) {
      if (this.built.has(part.id)) continue;

      const p = posed(part);

      this.root.add(p.group);
      this.built.set(part.id, { part, posed: p });
    }

    this.items = [...this.built.values()].map((b) => b.posed);
  }

  surfaces(): THREE.Group[] {
    return [...this.built.values()]
      .filter(({ part }) => /\b(wall|floor|ground)\b/i.test(part.name))
      .map(({ posed }) => posed.group);
  }

  dispose(): void {
    this.sync([]);
  }
}

export class LiveStage {
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly lens: LensRenderer;

  private readonly labels: TrainingPasses;

  private readonly ground = floor();

  private readonly surfacePool = new TrainingSurfaces();

  private readonly parts: Layer;

  private readonly world: Layer;

  private model: SimModel | null = null;

  private views: CameraView[] = [];

  private sceneTicket = 0;

  private trainingTail: Promise<void> = Promise.resolve();

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
    this.scene.add(this.ground);
    this.lens = new LensRenderer(this.renderer);
    this.labels = new TrainingPasses(this.renderer, this.scene, this.lens);
    this.parts = new Layer(this.scene);
    this.world = new Layer(this.scene);
  }

  get canvas(): OffscreenCanvas {
    return this.renderer.domElement as unknown as OffscreenCanvas;
  }

  async setScene(parts: ScenePart[], world: ScenePart[], meshes?: MeshFiles): Promise<boolean> {
    const ticket = ++this.sceneTicket;

    provideMeshFiles(meshes);
    await loadPartMeshes([...this.parts.changed(parts), ...this.world.changed(world)]);

    if (ticket !== this.sceneTicket) return false;

    this.surfacePool.dispose();
    this.parts.sync(parts);
    this.world.sync(world);
    await this.lens.warm(this.scene).catch(() => undefined);

    return ticket === this.sceneTicket;
  }

  setModel(model: SimModel | null): void {
    this.model = model;
  }

  setViews(views: CameraView[]): void {
    this.views = views;
  }

  draw(poses: Float64Array | null, jobs: LiveJob[]): LiveJob[] {
    const byKey = new Map(this.views.map((v) => [v.key, v]));
    const ready = jobs.filter((job) => byKey.has(job.key));

    if (!ready.length) return ready;

    const parts = this.pose(poses);
    const gl = this.canvas;

    for (const { key, target } of ready) {
      const width = Math.min(target.canvas.width, gl.width);
      const height = Math.min(target.canvas.height, gl.height);

      this.render(byKey.get(key)!, parts, { width, height });
      target.ctx.drawImage(gl, 0, gl.height - height, width, height, 0, 0, width, height);
    }

    return ready;
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

  training(request: CameraTrainingRequest): Promise<CameraTrainingFrame> {
    const result = this.trainingTail.then(() => this.captureTraining(request));

    this.trainingTail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async captureTraining(request: CameraTrainingRequest): Promise<CameraTrainingFrame> {
    const view = this.views.find((candidate) => candidate.key === request.key);
    const { width, height } = request;

    if (!view) throw new Error('Choose a camera view.');

    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 4096 ||
      height > 4096
    )
      throw new Error('Choose an image size between 1 and 4096 pixels.');

    this.pose(request.poses);
    this.renderer.setSize(width, height, false);

    const items = [...this.parts.items, ...this.world.items];
    const variation = varyTrainingScene({
      scene: this.scene,
      items,
      seed: request.seed,
      randomization: request.randomization,
      surfaces: [this.ground, ...this.world.surfaces()],
      surfacePool: this.surfacePool,
    });
    const delta = view.part ? variation.deltas.get(view.part) : undefined;
    const shot = varyTrainingShot(
      { ...placeCamera(view, delta), lens: view.lens },
      request.seed,
      request.randomization,
    );

    try {
      this.lens.render(this.scene, shot);

      const jpeg = await trainingJpeg(this.canvas, request.seed, request.randomization?.noise);
      const labels = this.labels.capture({
        shot,
        items,
        width,
        height,
      });
      const keypoints = projectTrainingPoints({
        shot,
        width,
        height,
        depth: labels.depth,
        points: request.keypoints,
        deltas: variation.deltas,
      });

      return { jpeg, width, height, ...labels, keypoints, variants: variation.variants };
    } finally {
      variation.restore();
    }
  }

  dispose(): void {
    this.parts.dispose();
    this.world.dispose();
    this.ground.geometry.dispose();

    const materials = Array.isArray(this.ground.material) ? this.ground.material : [this.ground.material];

    materials.forEach((material) => material.dispose());
    this.scene.environment?.dispose();
    this.surfacePool.dispose();
    this.labels.dispose();
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

  private render(view: CameraView, parts: Map<string, THREE.Matrix4>, viewport?: { width: number; height: number }) {
    const delta = view.part ? parts.get(view.part) : undefined;

    this.lens.render(this.scene, { ...placeCamera(view, delta), lens: view.lens }, viewport);
  }
}
