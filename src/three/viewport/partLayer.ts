import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import { applyPartTransform, buildPartGroup, releasePartGroup } from '../buildPartMesh';
import { preparePart } from '../partMesh/prepare';
import type { PartBatches } from './partBatches';

interface Entry {
  part: ScenePart;
  selected: boolean;
  meshVersion: number;
  group: THREE.Group;
}

const TRANSFORM_KEYS = new Set(['position', 'rotation']);

export function onlyTransformChanged(a: ScenePart, b: ScenePart): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ScenePart>;

  return [...keys].every((key) => TRANSFORM_KEYS.has(key) || a[key] === b[key]);
}

const UNIT = new THREE.Vector3(1, 1, 1);

const FRAME_BUDGET_MS = 6;

const UPLOAD_VERTICES_PER_FRAME = 200_000;

interface PendingBuild {
  part: ScenePart;
  selected: boolean;
  meshVersion: number;
}

const rememberRest = (group: THREE.Group) => {
  group.userData.restPosition = group.position.clone();
  group.userData.restQuaternion = group.quaternion.clone();
};

export class PartLayer {
  pose = new Map<string, THREE.Matrix4>();

  private readonly entries = new Map<string, Entry>();

  private pending: PendingBuild[] = [];

  private readonly waiting = new Map<string, PendingBuild>();

  private readonly uploaded = new WeakSet<THREE.BufferGeometry>();

  private readonly root: THREE.Group;

  private readonly onReady: () => void;

  private readonly batches: PartBatches | null;

  constructor(root: THREE.Group, onReady: () => void = () => {}, batches: PartBatches | null = null) {
    this.root = root;
    this.onReady = onReady;
    this.batches = batches;
  }

  get(id: string): THREE.Group | undefined {
    return this.entries.get(id)?.group;
  }

  part(id: string): ScenePart | undefined {
    return this.entries.get(id)?.part;
  }

  objects(): Array<[string, THREE.Group]> {
    return [...this.entries].map(([id, entry]) => [id, entry.group]);
  }

  get hasReady(): boolean {
    return this.pending.length > 0;
  }

  get hasPending(): boolean {
    return this.pending.length > 0 || this.waiting.size > 0;
  }

  sync(parts: ScenePart[], selected: ReadonlySet<string>, meshVersion: number): boolean {
    const visible = parts.filter((p) => p.visible);
    const keep = new Set(visible.map((p) => p.id));
    let changed = false;

    for (const [id, entry] of this.entries) {
      if (keep.has(id)) continue;

      this.remove(id, entry);
      changed = true;
    }

    this.pending = [];
    this.waiting.clear();

    for (const part of visible) {
      changed = this.upsert({ part, selected: selected.has(part.id), meshVersion }) || changed;
    }

    return this.buildPending(FRAME_BUDGET_MS) || changed;
  }

  buildPending(budgetMs = Infinity): boolean {
    const start = performance.now();
    const uploadBudget = budgetMs === Infinity ? Infinity : UPLOAD_VERTICES_PER_FRAME;
    let uploads = 0;
    let built = false;

    while (this.pending.length && performance.now() - start < budgetMs && uploads < uploadBudget) {
      uploads += this.build(this.pending.shift()!);
      built = true;
    }

    return built;
  }

  buildAll(): boolean {
    this.pending.push(...this.waiting.values());
    this.waiting.clear();

    return this.buildPending();
  }

  applyPose(skip?: THREE.Object3D | null): void {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    for (const [id, { group }] of this.entries) {
      const rest = this.restOf(group);

      if (!rest || group === skip) continue;

      const delta = this.pose.get(id);

      if (delta) {
        matrix.compose(rest.position, rest.quaternion, UNIT).premultiply(delta);
        matrix.decompose(group.position, group.quaternion, scale);
      } else {
        group.position.copy(rest.position);
        group.quaternion.copy(rest.quaternion);
      }

      group.updateMatrixWorld(true);
    }
  }

  toRest(id: string, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    const delta = this.pose.get(id);

    if (!delta) {
      return { position: position.clone(), quaternion: quaternion.clone() };
    }

    const restPosition = new THREE.Vector3();
    const restQuaternion = new THREE.Quaternion();

    new THREE.Matrix4()
      .compose(position, quaternion, UNIT)
      .premultiply(delta.clone().invert())
      .decompose(restPosition, restQuaternion, new THREE.Vector3());

    return { position: restPosition, quaternion: restQuaternion };
  }

  withRest<T>(run: () => T, reapply: () => void): T {
    if (!this.pose.size) {
      return run();
    }

    const saved = this.pose;

    this.pose = new Map();
    reapply();

    try {
      return run();
    } finally {
      this.pose = saved;
      reapply();
    }
  }

  replaceContents(id: string, build: (group: THREE.Group) => void): void {
    const entry = this.entries.get(id);

    if (!entry) {
      return;
    }

    this.batches?.remove(entry.group);
    releasePartGroup(entry.group);
    entry.group.clear();
    build(entry.group);
    this.batches?.add(entry.group);
  }

  dispose(): void {
    for (const [id, entry] of this.entries) this.remove(id, entry);
  }

  private restOf(group: THREE.Group) {
    const position = group.userData.restPosition as THREE.Vector3 | undefined;
    const quaternion = group.userData.restQuaternion as THREE.Quaternion | undefined;

    return position && quaternion ? { position, quaternion } : null;
  }

  private upsert(next: PendingBuild): boolean {
    const { part, selected, meshVersion } = next;
    const entry = this.entries.get(part.id);
    const sameLook =
      entry &&
      entry.selected === selected &&
      ((part.kind !== 'component' && !part.mesh?.visual) || entry.meshVersion === meshVersion);

    if (entry && entry.part === part && sameLook) {
      return false;
    }

    if (entry && sameLook && onlyTransformChanged(entry.part, part)) {
      entry.part = part;
      applyPartTransform(entry.group, part);
      entry.group.scale.set(1, 1, 1);
      rememberRest(entry.group);

      return true;
    }

    this.queue(next);

    return false;
  }

  private queue(next: PendingBuild): void {
    const prepared = preparePart(next.part);

    if (!prepared) {
      this.pending.push(next);

      return;
    }

    const id = next.part.id;

    this.waiting.set(id, next);
    void prepared.then(() => {
      if (this.waiting.get(id) !== next) return;

      this.waiting.delete(id);
      this.pending.push(next);
      this.onReady();
    });
  }

  private build({ part, selected, meshVersion }: PendingBuild): number {
    const old = this.entries.get(part.id);
    const group = buildPartGroup(part, selected, { shareGeometry: true, lateEdges: true });

    if (old) this.remove(part.id, old);

    rememberRest(group);
    this.root.add(group);
    this.batches?.add(group);
    this.entries.set(part.id, { part, selected, meshVersion, group });

    return this.newVertices(group);
  }

  private newVertices(group: THREE.Group): number {
    let count = 0;

    group.traverse((object) => {
      const geometry = (object as THREE.Mesh).geometry;

      if (!geometry || this.uploaded.has(geometry)) return;

      this.uploaded.add(geometry);
      count += geometry.getAttribute('position')?.count ?? 0;
    });

    return count;
  }

  private remove(id: string, entry: Entry): void {
    this.batches?.remove(entry.group);
    this.root.remove(entry.group);
    releasePartGroup(entry.group);
    this.entries.delete(id);
  }
}
