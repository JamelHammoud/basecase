import type * as THREE from 'three';
import type { SparkRenderer } from '@sparkjsdev/spark';
import type { StoredWorld, WorldFrame, WorldMeshRef } from '../../cases/worldTypes';
import { buildWorldLook, placeLook, type BuiltLook, type LookKind } from '../worldLook';
import { sparkRenderer } from '../worldLookSplat';

export interface WorldLookHooks {
  renderer: THREE.WebGLRenderer;
  redraw: () => void;
  invalidate: () => void;
  load: (hash: string) => Promise<StoredWorld | null>;
}

interface ShownLook extends BuiltLook {
  hash: string;
  frame: WorldFrame;
}

const sameRef = (a: WorldMeshRef | null, b: WorldMeshRef | null) =>
  a === b || (!!a && !!b && a.hash === b.hash && a.at.every((v, i) => v === b.at[i]));

export class WorldLookLayer {
  private ref: WorldMeshRef | null = null;

  private shown: ShownLook | null = null;

  private spark: Promise<SparkRenderer> | null = null;

  private generation = 0;

  private readonly parent: THREE.Object3D;

  private readonly hooks: WorldLookHooks;

  constructor(parent: THREE.Object3D, hooks: WorldLookHooks) {
    this.parent = parent;
    this.hooks = hooks;
  }

  get kind(): LookKind | null {
    return this.shown?.kind ?? null;
  }

  async set(ref: WorldMeshRef | null): Promise<void> {
    if (sameRef(ref, this.ref)) return;

    const generation = ++this.generation;

    this.ref = ref;

    if (ref && this.shown?.hash === ref.hash) {
      this.place();

      return;
    }

    this.clear();

    if (!ref) return;

    const look = await this.build(ref.hash).catch(() => null);

    if (generation !== this.generation) look?.dispose();
    else if (look) await this.show(look);
  }

  dispose(): void {
    this.generation++;
    this.clear();
    void this.spark?.then((spark) => {
      spark.removeFromParent();
      spark.dispose();
    });
    this.spark = null;
  }

  private async build(hash: string): Promise<ShownLook | null> {
    const world = await this.hooks.load(hash);

    if (!world) return null;

    if (world.look.splat) await this.sparkReady();

    return { ...(await buildWorldLook(world)), hash, frame: world.frame };
  }

  private sparkReady(): Promise<SparkRenderer> {
    this.spark ??= sparkRenderer(this.hooks.renderer, this.hooks.redraw).then((spark) => {
      spark.name = 'world-splats';
      spark.visible = false;
      this.parent.add(spark);

      return spark;
    });

    return this.spark;
  }

  private async show(look: ShownLook): Promise<void> {
    this.shown = look;
    this.parent.add(look.object);
    this.place();

    if (look.kind === 'splat') (await this.sparkReady()).visible = this.shown === look;
  }

  private place(): void {
    if (!this.shown || !this.ref) return;

    placeLook(this.shown.object, this.shown.frame, this.ref.at);
    this.hooks.invalidate();
  }

  private clear(): void {
    const { shown } = this;

    if (!shown) return;

    this.shown = null;
    shown.object.removeFromParent();
    shown.dispose();
    void this.spark?.then((spark) => (spark.visible = false));
    this.hooks.invalidate();
  }
}
