import * as THREE from 'three';
import { onLateChildren } from '../lateChildren';
import { batchedMaterialFrom, batchKey, batchMaterial, lineKey, lineMaterial } from './batchKey';
import { LineBatch } from './lineBatch';
import { MeshBatch } from './meshBatch';

export const BATCHED_LAYER = 5;

interface DrawBatch {
  readonly object: THREE.Object3D;
  readonly size: number;
  readonly tintable: boolean;
  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): number;

  remove(instance: number, geometry: THREE.BufferGeometry): void;

  setMatrix(instance: number, matrix: THREE.Matrix4): void;

  setColor(instance: number, color: THREE.Color): void;

  setVisible(instance: number, visible: boolean): void;

  refresh(geometry: THREE.BufferGeometry, instance: number): void;

  dispose(): void;
}

type Batchable = THREE.Mesh | THREE.LineSegments;

type Tinted = THREE.MeshStandardMaterial | THREE.LineBasicMaterial;

interface Plan {
  key: string;
  material: Tinted;
  create: () => DrawBatch;
}

interface Member {
  object: Batchable;
  key: string;
  geometry: THREE.BufferGeometry;
  material: Tinted;
  batch: DrawBatch;
  instance: number;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  shown: boolean;
  position: number;
  normal: number;
  index: number;
}

type AnyAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;

const versionOf = (attribute: AnyAttribute) => {
  if (!attribute) return 0;

  return attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
};

const versionsOf = (geometry: THREE.BufferGeometry) => ({
  position: versionOf(geometry.getAttribute('position')),
  normal: versionOf(geometry.getAttribute('normal')),
  index: geometry.index?.version ?? 0,
});

const edited = ({ geometry, position, normal, index }: Member) =>
  versionOf(geometry.getAttribute('position')) !== position ||
  versionOf(geometry.getAttribute('normal')) !== normal ||
  (geometry.index?.version ?? 0) !== index;

const replaced = ({ object, geometry, material, color, batch }: Member) =>
  object.geometry !== geometry || object.material !== material || (!batch.tintable && !color.equals(material.color));

function shownInTree(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }

  return true;
}

function meshPlan(mesh: THREE.Mesh): Plan | null {
  const material = batchMaterial(mesh);

  if (!material) return null;

  return {
    key: `mesh|${batchKey(mesh, material)}`,
    material,
    create: () =>
      new MeshBatch({
        material: batchedMaterialFrom(material),
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        indexed: Boolean(mesh.geometry.index),
      }),
  };
}

function linesPlan(lines: THREE.LineSegments): Plan | null {
  const material = lineMaterial(lines);

  return material && { key: `lines|${lineKey(material)}`, material, create: () => new LineBatch(material) };
}

function planFor(object: THREE.Object3D): Plan | null {
  if ((object as THREE.Mesh).isMesh) return meshPlan(object as THREE.Mesh);

  return (object as THREE.LineSegments).isLineSegments ? linesPlan(object as THREE.LineSegments) : null;
}

export class PartBatches {
  readonly root = new THREE.Group();

  private readonly batches = new Map<string, DrawBatch>();

  private readonly members = new Map<Batchable, Member>();

  private readonly owners = new Map<Batchable, THREE.Object3D>();

  private readonly groups = new Map<THREE.Object3D, Set<Batchable>>();

  private suspended = false;

  private stopLate = () => {};

  constructor() {
    this.root.name = 'part-batches';
    this.root.matrixAutoUpdate = false;
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.root);
    scene.onBeforeRender = () => this.sync();
    this.stopLate = onLateChildren((group) => this.groups.has(group) && this.extend(group));
  }

  add(group: THREE.Object3D): void {
    this.groups.set(group, new Set());
    this.extend(group);
  }

  remove(group: THREE.Object3D): void {
    this.groups.get(group)?.forEach((object) => this.untrack(object));
    this.groups.delete(group);
  }

  sync(): void {
    if (this.suspended) return;

    for (const member of [...this.members.values()]) this.syncMember(member);
  }

  unbatched<T>(run: () => T): T {
    if (this.suspended) return run();

    this.suspended = true;
    this.root.visible = false;
    this.members.forEach(({ object }) => object.layers.enable(0));

    try {
      return run();
    } finally {
      this.members.forEach(({ object }) => object.layers.disable(0));
      this.root.visible = true;
      this.suspended = false;
      this.sync();
    }
  }

  stats(): { batches: number; instances: number } {
    return { batches: this.batches.size, instances: this.members.size };
  }

  dispose(): void {
    this.stopLate();
    [...this.members.keys()].forEach((object) => this.untrack(object));
    this.groups.clear();
    this.root.removeFromParent();
  }

  private extend(group: THREE.Object3D): void {
    group.updateMatrixWorld(true);
    group.traverse((object) => {
      const plan = this.members.has(object as Batchable) ? null : planFor(object);

      if (plan) this.track(object as Batchable, plan, group);
    });
  }

  private track(object: Batchable, plan: Plan, group: THREE.Object3D): void {
    const batch = this.batches.get(plan.key) ?? this.createBatch(plan);

    this.members.set(object, {
      object,
      key: plan.key,
      geometry: object.geometry,
      material: plan.material,
      batch,
      instance: batch.add(object.geometry, object.matrixWorld, plan.material.color),
      matrix: object.matrixWorld.clone(),
      color: plan.material.color.clone(),
      shown: true,
      ...versionsOf(object.geometry),
    });
    this.owners.set(object, group);
    this.groups.get(group)?.add(object);
    object.layers.enable(BATCHED_LAYER);

    if (!this.suspended) object.layers.disable(0);
  }

  private untrack(object: Batchable): void {
    const member = this.members.get(object);

    if (!member) return;

    this.members.delete(object);
    this.groups.get(this.owners.get(object)!)?.delete(object);
    this.owners.delete(object);
    member.batch.remove(member.instance, member.geometry);
    object.layers.enable(0);
    object.layers.disable(BATCHED_LAYER);

    if (member.batch.size) return;

    this.batches.delete(member.key);
    this.root.remove(member.batch.object);
    member.batch.dispose();
  }

  private createBatch(plan: Plan): DrawBatch {
    const batch = plan.create();

    this.batches.set(plan.key, batch);
    this.root.add(batch.object);

    return batch;
  }

  private retrack({ object }: Member): void {
    const group = this.owners.get(object)!;

    this.untrack(object);

    const plan = planFor(object);

    if (plan) this.track(object, plan, group);
  }

  private syncMember(member: Member): void {
    if (replaced(member)) {
      this.retrack(member);

      return;
    }

    const { object, batch, instance, material } = member;
    const shown = shownInTree(object);

    if (shown !== member.shown) {
      member.shown = shown;
      batch.setVisible(instance, shown);
    }

    if (!member.matrix.equals(object.matrixWorld)) batch.setMatrix(instance, member.matrix.copy(object.matrixWorld));

    if (!member.color.equals(material.color)) batch.setColor(instance, member.color.copy(material.color));

    if (!edited(member)) return;

    Object.assign(member, versionsOf(object.geometry));
    batch.refresh(object.geometry, instance);
  }
}
