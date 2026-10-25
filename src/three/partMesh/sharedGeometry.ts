import * as THREE from 'three';

interface Entry {
  value: unknown;
  refs: number;
  weight: number;
  dispose: () => void;
}

const RETAINED_VERTICES = 3_000_000;

const entries = new Map<string, Entry>();
const retained = new Map<string, Entry>();
let retainedWeight = 0;
const objectIds = new WeakMap<object, number>();

let nextObjectId = 1;

export function objectKey(source: object): string {
  let id = objectIds.get(source);

  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(source, id);
  }

  return `o${id}`;
}

const vertexCount = (candidate: unknown): number => {
  if (candidate instanceof THREE.BufferGeometry) return candidate.getAttribute('position')?.count ?? 0;

  return Array.isArray(candidate)
    ? candidate.reduce((sum: number, item: unknown) => sum + vertexCount((item as { geometry?: unknown })?.geometry), 0)
    : 0;
};

function retain(key: string, entry: Entry): void {
  retained.set(key, entry);
  retainedWeight += entry.weight;

  for (const [oldKey, old] of retained) {
    if (retainedWeight <= RETAINED_VERTICES) break;

    retained.delete(oldKey);
    retainedWeight -= old.weight;
    old.dispose();
  }
}

function revive(key: string): Entry | undefined {
  const entry = retained.get(key);

  if (!entry) return undefined;

  retained.delete(key);
  retainedWeight -= entry.weight;
  entries.set(key, entry);

  return entry;
}

const newEntry = <T>(value: T, dispose: (value: T) => void, refs: number): Entry => ({
  value,
  refs,
  weight: vertexCount(value),
  dispose: () => dispose(value),
});

export function hasShared(key: string): boolean {
  return entries.has(key) || retained.has(key);
}

export function acquireShared<T>(key: string, build: () => T, dispose: (value: T) => void): T {
  const existing = entries.get(key) ?? revive(key);

  if (existing) {
    existing.refs++;

    return existing.value as T;
  }

  const value = build();

  entries.set(key, newEntry(value, dispose, 1));

  return value;
}

export function offerShared<T>(key: string, value: T, dispose: (value: T) => void): void {
  if (hasShared(key)) {
    dispose(value);

    return;
  }

  retain(key, newEntry(markShared(value), dispose, 0));
}

export function releaseShared(key: string): void {
  const entry = entries.get(key);

  if (!entry) {
    return;
  }

  entry.refs--;

  if (entry.refs > 0) {
    return;
  }

  entries.delete(key);
  retain(key, entry);
}

export function sharedEntryCount(): number {
  return entries.size;
}

const markGeometry = (candidate: unknown) => {
  if (candidate instanceof THREE.BufferGeometry) candidate.userData.cached = true;
};

export function markShared<T>(value: T): T {
  markGeometry(value);

  if (Array.isArray(value)) {
    value.forEach((item: unknown) => markGeometry((item as { geometry?: unknown })?.geometry));
  }

  return value;
}

export function disposeCachedGeometry(geometry: THREE.BufferGeometry): void {
  geometry.dispose();
}

const isKeptGeometry = (geometry: THREE.BufferGeometry) =>
  Boolean(geometry.userData.cached || geometry.userData.shared);

const disposeMaterials = (material: THREE.Material | THREE.Material[]) => {
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
};

export function releasePartGroup(group: THREE.Object3D): void {
  const keys = (group.userData.sharedKeys as string[] | undefined) ?? [];

  group.traverse((object) => {
    const drawable = object as THREE.Mesh;

    if (!drawable.geometry) {
      return;
    }

    if (!isKeptGeometry(drawable.geometry)) drawable.geometry.dispose();

    disposeMaterials(drawable.material);
  });

  for (const key of keys) releaseShared(key);

  group.userData.sharedKeys = [];
}
