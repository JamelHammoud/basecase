import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import { componentArrays, type ComponentArrays } from './componentGeometry';
import { geometryWorker } from './geometryWorker';
import { geometryFromArrays } from './partMesh/creased';
import { linesGeometry } from './partMesh/lateEdges';

export interface ComponentPiece {
  geometry: THREE.BufferGeometry;
  color: string;
  metalness: number;
  roughness: number;
}

export interface LoadedComponent {
  pieces: ComponentPiece[];
  edges: THREE.BufferGeometry;
  size: [number, number, number];
}

type Entry = { status: 'loading' } | { status: 'ready'; mesh: LoadedComponent } | { status: 'error'; error: string };

const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<LoadedComponent>>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

export const componentMeshUrl = (id: string) => `${import.meta.env.BASE_URL}parts/${id}.glb`;

const processComponent = (data: ArrayBuffer): Promise<ComponentArrays> =>
  typeof document === 'undefined' ? componentArrays(data) : geometryWorker.call('component', data, [data]);

const shared = (geometry: THREE.BufferGeometry) => {
  geometry.userData.shared = true;

  return geometry;
};

function componentFromArrays(arrays: ComponentArrays): LoadedComponent {
  return {
    pieces: arrays.pieces.map(({ position, normal, color, metalness, roughness }) => ({
      geometry: shared(geometryFromArrays(position, normal)),
      color,
      metalness,
      roughness,
    })),
    edges: shared(linesGeometry(arrays.edges)),
    size: arrays.size,
  };
}

export function loadComponentMesh(id: string): Promise<LoadedComponent> {
  const entry = entries.get(id);

  if (entry?.status === 'ready') return Promise.resolve(entry.mesh);

  const inflight = pending.get(id);

  if (inflight) return inflight;

  entries.set(id, { status: 'loading' });

  const promise = (async () => {
    const res = await fetch(componentMeshUrl(id));

    if (!res.ok) throw new Error(`Couldn't load the ${id} model (${res.status}).`);

    const mesh = componentFromArrays(await processComponent(await res.arrayBuffer()));

    entries.set(id, { status: 'ready', mesh });
    pending.delete(id);
    notify();

    return mesh;
  })().catch((err: unknown) => {
    entries.set(id, { status: 'error', error: String((err as Error)?.message ?? err) });
    pending.delete(id);
    notify();

    throw err;
  });

  pending.set(id, promise);

  return promise;
}

export function getComponentMesh(id: string): LoadedComponent | null {
  const entry = entries.get(id);

  if (entry?.status === 'ready') return entry.mesh;

  if (!entry) loadComponentMesh(id).catch(() => {});

  return null;
}

export function componentMeshError(id: string): string | null {
  const entry = entries.get(id);

  return entry?.status === 'error' ? entry.error : null;
}

export function useComponentMeshVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);

      return () => listeners.delete(cb);
    },
    () => version,
  );
}
