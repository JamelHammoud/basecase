import * as THREE from 'three';
import type { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
import type { WorldHull } from '../../cases/worldDecomposition';
import type { ImportedMeshWorld } from '../../cases/worldImportTypes';
import { createWorldMesh } from './worldMesh';

export interface ImportedWorldView {
  hash: string;
  asset: { world: ImportedMeshWorld; pieces: readonly WorldHull[] };
  position: [number, number, number];
}

export interface ImportedWorldState {
  hash: string | null;
  splat: boolean;
  meshes: number;
  pieces: number;
  loaded: boolean;
  splatCount: number;
  renderedSplats: number;
}

export class ImportedWorldLayer {
  readonly group = new THREE.Group();

  private view: ImportedWorldView | null = null;

  private generation = 0;

  private loaded = false;

  private prepared: number[] | null = null;

  private spark: SparkRenderer | null = null;

  private splat: SplatMesh | null = null;

  private releaseMesh: (() => void) | null = null;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly redraw: () => void;

  private readonly manual: boolean;

  constructor(parent: THREE.Object3D, renderer: THREE.WebGLRenderer, redraw: () => void, manual = false) {
    this.renderer = renderer;
    this.manual = manual;
    this.redraw = redraw;
    this.group.name = 'imported-world';
    parent.add(this.group);
  }

  async set(view: ImportedWorldView | null): Promise<void> {
    if (view?.hash === this.view?.hash && view) {
      this.move(view);

      return;
    }

    this.clear();
    this.view = view;

    if (!view) return;

    this.group.position.set(...view.position);

    const generation = this.generation;
    const { world } = view.asset;

    try {
      if (world.splat) await this.loadSplats(world, generation);
      else await this.loadMesh(world);
    } catch (error) {
      if (generation !== this.generation) return;

      this.clear();
      this.view = null;

      throw error;
    }

    if (generation !== this.generation) return;

    this.loaded = true;
    this.redraw();
  }

  async prepare(scene: THREE.Scene, camera: THREE.Camera, viewport?: { width: number; height: number }): Promise<void> {
    const spark = this.spark;

    if (!this.manual || !spark) return;

    const size = viewport
      ? new THREE.Vector2(viewport.width, viewport.height)
      : this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const generation = this.generation;

    camera.updateWorldMatrix(true, false);
    this.group.updateWorldMatrix(true, false);

    const values = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      ...this.group.matrixWorld.elements,
      size.x,
      size.y,
    ];

    if (this.prepared?.every((value, index) => value === values[index])) return;

    spark.renderSize.copy(size);
    await spark.update({ scene, camera });

    if (generation === this.generation) this.prepared = values;
  }

  state(): ImportedWorldState {
    return {
      hash: this.view?.hash ?? null,
      splat: Boolean(this.splat?.parent === this.group),
      meshes: this.group.children.filter((object) => object.name === 'imported-world-mesh').length,
      pieces: this.view?.asset.pieces.length ?? 0,
      loaded: this.loaded,
      splatCount: this.splat?.numSplats ?? 0,
      renderedSplats: this.spark?.activeSplats ?? 0,
    };
  }

  dispose(): void {
    this.clear();
    this.view = null;
    this.group.removeFromParent();
  }

  private move(view: ImportedWorldView): void {
    const moved = view.position.some((value, index) => value !== this.view?.position[index]);

    this.view = view;
    this.group.position.set(...view.position);

    if (moved) this.redraw();
  }

  private clear(): void {
    this.generation++;
    this.loaded = false;
    this.prepared = null;
    this.releaseMesh?.();
    this.releaseMesh = null;

    const splat = this.splat;

    splat?.removeFromParent();

    if (splat)
      void splat.initialized.then(
        () => splat.dispose(),
        () => splat.dispose(),
      );

    this.splat = null;
    this.spark?.removeFromParent();
    this.spark?.dispose();
    this.spark = null;
    this.redraw();
  }

  private async loadMesh(world: ImportedMeshWorld): Promise<void> {
    const visual = createWorldMesh(world.mesh);

    this.releaseMesh = visual.dispose;
    this.group.add(visual.object);
    await visual.ready;
  }

  private async loadSplats(world: ImportedMeshWorld, generation: number): Promise<void> {
    const { SparkRenderer, SplatMesh, SplatFileType } = await import('@sparkjsdev/spark');

    if (generation !== this.generation || !world.splat) return;

    const spark = new SparkRenderer({
      renderer: this.renderer,
      onDirty: this.redraw,
      enableLod: false,
      ...(this.manual ? { autoUpdate: false, minSortIntervalMs: 0 } : {}),
    });

    this.spark = spark;

    const splat = new SplatMesh({
      fileBytes: world.splat.bytes,
      fileType: world.splat.format === 'spz' ? SplatFileType.SPZ : SplatFileType.PLY,
      fileName: world.splat.name,
      editable: false,
      raycastable: false,
      lod: false,
    });

    splat.name = 'imported-world-splats';
    splat.position.set(...world.transform.translation);
    splat.quaternion.set(...world.transform.quaternion);
    splat.scale.setScalar(world.transform.scale);
    this.splat = splat;
    this.group.add(spark, splat);
    await splat.initialized;
  }
}
