import { textureHashes } from '../appearance/model';
import { getTextureAsset } from '../cases/worldAssets';
import { provideTextureBlob } from '../appearance/textures';
import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import { loadSourced } from '../data/loadSourced';
import { isSourcedId } from '../data/sourcedItems';
import type { ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { componentArrays, type ComponentArrays } from './componentGeometry';
import { geometryWorker } from './geometryWorker';
import { geometryFromArrays } from './partMesh/creased';
import { linesGeometry } from './partMesh/lateEdges';
import { errorMessage } from '../utils/errorMessage';

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

async function sourcedBytes(id: string): Promise<ArrayBuffer> {
  const bytes = await platformBridge.sourcedMesh(id);

  if (!bytes) throw new Error(`Couldn’t load the ${id} model.`);

  return bytes;
}

export type MeshFiles = Record<string, ArrayBuffer>;
export type RenderMeshFiles = Record<string, ArrayBuffer | Blob>;

const provided = new Map<string, ArrayBuffer>();

function provideTextureFile(hash: string, bytes: ArrayBuffer | Blob): void {
  if (bytes instanceof Blob) provideTextureBlob(hash, bytes);
}

export function provideMeshFiles(files: RenderMeshFiles = {}) {
  for (const [id, bytes] of Object.entries(files)) {
    if (id.startsWith('texture:')) {
      provideTextureFile(id.slice(8), bytes);

      continue;
    }

    if (!(bytes instanceof ArrayBuffer)) continue;

    provided.set(id, bytes);
    entries.delete(id);
    pending.delete(id);
  }
}

export async function sourcedMeshFiles(parts: Pick<ScenePart, 'componentId'>[]): Promise<MeshFiles> {
  await loadSourced();

  const ids = new Set(parts.flatMap((p) => (p.componentId && isSourcedId(p.componentId) ? [p.componentId] : [])));
  const files = await Promise.all([...ids].map(async (id) => [id, await platformBridge.sourcedMesh(id)] as const));

  return Object.fromEntries(files.filter((file): file is readonly [string, ArrayBuffer] => !!file[1]));
}

export function textureMeshFiles(parts: Pick<ScenePart, 'appearance' | 'boolean' | 'customNodes'>[]): RenderMeshFiles {
  return Object.fromEntries(
    textureHashes(parts).flatMap((hash) => {
      const asset = getTextureAsset(hash);

      return asset ? [[`texture:${hash}`, asset.encoded] as const] : [];
    }),
  );
}

export async function renderMeshFiles(
  parts: Pick<ScenePart, 'componentId' | 'appearance' | 'boolean' | 'customNodes'>[],
): Promise<RenderMeshFiles> {
  return { ...(await sourcedMeshFiles(parts)), ...textureMeshFiles(parts) };
}

export function forgetComponentMesh(id: string) {
  entries.delete(id);
  pending.delete(id);
  notify();
}

async function meshBytes(id: string): Promise<ArrayBuffer> {
  const given = provided.get(id);

  if (given) return given.slice(0);

  if (typeof document !== 'undefined') await loadSourced();

  if (isSourcedId(id)) return sourcedBytes(id);

  const res = await fetch(componentMeshUrl(id));

  if (!res.ok) throw new Error(`Couldn’t load the ${id} model (${res.status}).`);

  return res.arrayBuffer();
}

const processComponent = (data: ArrayBuffer): Promise<ComponentArrays> =>
  typeof document === 'undefined' ? componentArrays(data) : geometryWorker.call('component', data, [data]);

const shared = (geometry: THREE.BufferGeometry) => {
  geometry.userData.shared = true;

  return geometry;
};

function componentGeometry(position: Float32Array, normal: Float32Array, uv?: Float32Array): THREE.BufferGeometry {
  const geometry = geometryFromArrays(position, normal);

  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  return geometry;
}

function componentFromArrays(arrays: ComponentArrays): LoadedComponent {
  return {
    pieces: arrays.pieces.map(({ position, normal, uv, color, metalness, roughness }) => ({
      geometry: shared(componentGeometry(position, normal, uv)),
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
    const mesh = componentFromArrays(await processComponent(await meshBytes(id)));

    entries.set(id, { status: 'ready', mesh });
    pending.delete(id);
    notify();

    return mesh;
  })().catch((err: unknown) => {
    entries.set(id, { status: 'error', error: errorMessage(err) });
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

export async function componentMeshesReady(ids: Iterable<string>): Promise<string[]> {
  const unique = [...new Set(ids)].filter((id) => !id.startsWith('texture:'));
  const loads = await Promise.allSettled(unique.map((id) => loadComponentMesh(id)));

  return unique.filter((_, i) => loads[i].status === 'rejected');
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
