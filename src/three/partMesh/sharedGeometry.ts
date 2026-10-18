import * as THREE from 'three';

interface Entry {
  value: unknown;
  refs: number;
  dispose: () => void;
}

const entries = new Map<string, Entry>();
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

export function acquireShared<T>(key: string, build: () => T, dispose: (value: T) => void): T {
  const existing = entries.get(key);

  if (existing) {
    existing.refs++;

    return existing.value as T;
  }

  const value = build();

  entries.set(key, { value, refs: 1, dispose: () => dispose(value) });

  return value;
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
  entry.dispose();
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
