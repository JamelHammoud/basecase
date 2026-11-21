import { onlyAppearanceChanged, reuseAppearanceMaterials } from '../../appearance/reuse';
import { applyAppearance } from '../../appearance/render';
import { prepareAppearance } from '../../appearance/textures';
import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import { applyPartTransform, buildPartGroup, releasePartGroup } from '../buildPartMesh';
import { getComponentMesh } from '../componentMeshes';
import { preparePart } from '../partMesh/prepare';
import type { PartBatches } from './partBatches';
import type { Vec3, ViewportProps } from './types';

interface Entry {
  part: ScenePart;
  selected: boolean;
  meshVersion: number;
  group: THREE.Group;
}

const TRANSFORM_KEYS = new Set(['position', 'rotation']);

type PoseProps = Pick<ViewportProps, 'pose' | 'poseOwners' | 'buildStep'>;

export function onlyTransformChanged(a: ScenePart, b: ScenePart): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ScenePart>;

  return [...keys].every((key) => TRANSFORM_KEYS.has(key) || a[key] === b[key]);
}

const UNIT = new THREE.Vector3(1, 1, 1);

const POSED = new THREE.Matrix4();

const SCALE = new THREE.Vector3();

const FRAME_BUDGET_MS = 6;

const UPLOAD_VERTICES_PER_FRAME = 200_000;

interface PendingBuild {
  appearance?: ReturnType<typeof prepareAppearance>;
  ready?: Promise<void>;
  part: ScenePart;
  selected: boolean;
  meshVersion: number;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

const rememberRest = (group: THREE.Group) => {
  group.userData.restPosition = group.position.clone();
  group.userData.restQuaternion = group.quaternion.clone();
};

export class PartLayer {
  pose = new Map<string, THREE.Matrix4>();
  poseOwners: ReadonlyMap<string, string> = new Map();

  private disposed = false;
  private source: ScenePart[] = [];

  private readonly entries = new Map<string, Entry>();

  private readonly pending = new Set<PendingBuild>();

  private readonly waiting = new Map<string, PendingBuild>();

  private readonly failures = new Map<string, unknown>();

  private readonly readers = new Set<ReadyWaiter>();

  private readonly uploaded = new WeakSet<THREE.BufferGeometry>();

  private readonly root: THREE.Group;

  private readonly onReady: () => void;

  private readonly batches: PartBatches | null;

  private readonly renderer: THREE.WebGLRenderer | null;

  constructor(
    root: THREE.Group,
    onReady: () => void = () => {},
    batches: PartBatches | null = null,
    renderer: THREE.WebGLRenderer | null = null,
  ) {
    this.root = root;
    this.onReady = onReady;
    this.batches = batches;
    this.renderer = renderer;
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
    return this.pending.size > 0;
  }

  get hasPending(): boolean {
    return this.pending.size > 0 || this.waiting.size > 0;
  }

  whenReady(): Promise<void> {
    if (this.disposed) return Promise.reject(AbortSignal.abort().reason);

    if (this.failures.size) return Promise.reject(this.failures.values().next().value);

    if (!this.hasPending) return Promise.resolve();

    return new Promise((resolve, reject) => this.readers.add({ resolve, reject }));
  }

  private settleReaders(): void {
    if (this.hasPending && !this.failures.size) return;

    for (const reader of this.readers) {
      if (this.failures.size) reader.reject(this.failures.values().next().value);
      else reader.resolve();
    }

    this.readers.clear();
  }

  pendingGeometry(ids?: ReadonlySet<string>): boolean {
    return [...this.pending, ...this.waiting.values()].some(({ part, meshVersion }) => {
      if (ids && !ids.has(part.id)) return false;

      const entry = this.entries.get(part.id);
      const versioned = part.kind === 'component' || !!part.mesh?.visual;

      return (
        !entry ||
        entry.part !== part ||
        !!entry.group.userData.placeholder ||
        (versioned && entry.meshVersion !== meshVersion)
      );
    });
  }

  sync(parts: ScenePart[], selected: ReadonlySet<string>, meshVersion: number): boolean {
    if (this.disposed) return false;

    const sameSource = this.source.length === parts.length && this.source.every((part, index) => part === parts[index]);

    if (!sameSource) {
      for (const reader of this.readers) reader.reject(AbortSignal.abort().reason);

      this.readers.clear();
    }

    this.source = parts;

    const visible = parts.filter((p) => p.visible);
    const keep = new Set(visible.map((p) => p.id));
    let changed = false;

    for (const [id, entry] of this.entries) {
      if (keep.has(id)) continue;

      this.remove(id, entry);
      changed = true;
    }

    this.clearPending();
    this.failures.clear();

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

    for (const next of this.pending) {
      const withinBudget = performance.now() - start < budgetMs && uploads < uploadBudget;

      if (!withinBudget) break;

      this.pending.delete(next);
      uploads += this.build(next);
      built = true;
    }

    this.settleReaders();

    return built;
  }

  queueLoadedComponents(): void {
    const queued = new Set([...this.pending, ...this.waiting.values()].map((b) => b.part.id));

    for (const { part, selected, meshVersion, group } of this.entries.values()) {
      const loaded = group.userData.placeholder && part.componentId && getComponentMesh(part.componentId);

      if (loaded && !queued.has(part.id)) this.pending.add({ part, selected, meshVersion });
    }
  }

  isPlaceholder(id: string): boolean {
    return Boolean(this.entries.get(id)?.group.userData.placeholder);
  }

  buildAll(): boolean {
    return this.buildPending();
  }

  applyPose(skip?: THREE.Object3D | null): void {
    for (const [id, { group }] of this.entries) {
      if (group !== skip) this.poseGroup(id, group);
    }
  }

  syncPose(previous: PoseProps, props: PoseProps): void {
    this.poseOwners = props.poseOwners ?? new Map();

    if (props.pose !== previous.pose && !props.buildStep) this.pose = props.pose ?? new Map();
  }

  applyPoseTo(ids: Iterable<string>): void {
    for (const id of ids) {
      const group = this.entries.get(id)?.group;

      if (group) this.poseGroup(id, group);
    }
  }

  toRest(id: string, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    const delta = this.poseFor(id);

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

  pointAtRest(id: string, point: Vec3): Vec3 {
    const delta = this.poseFor(id);

    return delta ? (new THREE.Vector3(...point).applyMatrix4(delta.clone().invert()).toArray() as Vec3) : point;
  }

  withRest<T>(run: () => T, reapply: () => void): T {
    return this.withPose(new Map(), run, reapply);
  }

  withPose<T>(pose: Map<string, THREE.Matrix4>, run: () => T, reapply: () => void): T {
    if (pose === this.pose || (!pose.size && !this.pose.size)) {
      return run();
    }

    const saved = this.pose;

    this.pose = pose;
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

    const lease = prepareAppearance([entry.part]);

    try {
      this.batches?.remove(entry.group);
      releasePartGroup(entry.group);
      entry.group.clear();
      build(entry.group);
      applyAppearance(entry.group, entry.part);
      this.batches?.add(entry.group);
    } finally {
      lease.release();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.source = [];
    this.clearPending();

    for (const reader of this.readers) reader.reject(AbortSignal.abort().reason);

    this.readers.clear();

    for (const [id, entry] of this.entries) this.remove(id, entry);
  }

  private poseGroup(id: string, group: THREE.Group): void {
    const rest = this.restOf(group);

    if (!rest) return;

    const delta = this.poseFor(id);

    if (delta) {
      POSED.compose(rest.position, rest.quaternion, UNIT).premultiply(delta);
      POSED.decompose(group.position, group.quaternion, SCALE);
    } else {
      group.position.copy(rest.position);
      group.quaternion.copy(rest.quaternion);
    }

    group.updateMatrixWorld(true);
  }

  private restOf(group: THREE.Group) {
    const position = group.userData.restPosition as THREE.Vector3 | undefined;
    const quaternion = group.userData.restQuaternion as THREE.Quaternion | undefined;

    return position && quaternion ? { position, quaternion } : null;
  }

  private poseFor(id: string) {
    return this.pose.get(this.poseOwners.get(id) ?? id);
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

  private clearPending(): void {
    for (const next of [...this.pending, ...this.waiting.values()]) next.appearance?.release();

    this.pending.clear();
    this.waiting.clear();
  }

  private queue(next: PendingBuild): void {
    next.appearance = prepareAppearance([next.part]);

    const prepared = preparePart(next.part);

    if (!prepared && !next.appearance.ready) {
      this.pending.add(next);

      return;
    }

    const id = next.part.id;

    this.waiting.set(id, next);
    next.ready = Promise.all([prepared, next.appearance.ready]).then(
      () => {
        if (this.waiting.get(id) !== next) return;

        this.waiting.delete(id);
        this.pending.add(next);
        this.onReady();
      },
      (error: unknown) => {
        if (this.waiting.get(id) !== next) return;

        this.waiting.delete(id);
        this.failures.set(id, error);
        next.appearance?.release();
        this.settleReaders();
        this.onReady();
      },
    );
  }

  private build(next: PendingBuild): number {
    try {
      return this.buildPrepared(next);
    } finally {
      next.appearance?.release();
    }
  }

  private buildPrepared({ part, selected, meshVersion }: PendingBuild): number {
    const old = this.entries.get(part.id);
    const group = buildPartGroup(part, selected, { shareGeometry: true, lateEdges: true });

    if (old && old.selected === selected && old.meshVersion === meshVersion && onlyAppearanceChanged(old.part, part))
      reuseAppearanceMaterials(old.group, group, (texture) => this.renderer?.initTexture(texture));

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
