import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';

export interface VisualPiece {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

type Entry = { status: 'loading' } | { status: 'ready'; nodes: Map<string, VisualPiece[]> } | { status: 'error' };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

const toBuffer = (file: string | Uint8Array): ArrayBuffer => {
  if (typeof file !== 'string')
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;

  return Uint8Array.from(atob(file), (c) => c.charCodeAt(0)).buffer;
};

async function visualBytes(key: string, url: string): Promise<ArrayBuffer | null> {
  const first = await platformBridge.simreadyFile({ key, file: 'visual.glb' });

  if (first) return toBuffer(first);

  if (!url) return null;

  await platformBridge.simreadyFetch({ url, requestId: `visual-${key}` });

  const again = await platformBridge.simreadyFile({ key, file: 'visual.glb' });

  return again ? toBuffer(again) : null;
}

function topNode(object: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  let at = object;

  while (at.parent && at.parent !== root) at = at.parent;

  return at;
}

async function parseVisual(bytes: ArrayBuffer): Promise<Map<string, VisualPiece[]>> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const nodes = new Map<string, VisualPiece[]>();

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;

    if (!mesh.isMesh) return;

    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const name = topNode(mesh, gltf.scene).name;

    geometry.userData.shared = true;
    nodes.set(name, [...(nodes.get(name) ?? []), { geometry, material }]);
  });

  return nodes;
}

async function load(key: string, url: string) {
  entries.set(key, { status: 'loading' });

  try {
    const bytes = await visualBytes(key, url);

    entries.set(key, bytes ? { status: 'ready', nodes: await parseVisual(bytes) } : { status: 'error' });
  } catch {
    entries.set(key, { status: 'error' });
  }

  notify();
}

export function simreadyVisual(part: ScenePart): VisualPiece[] | null {
  const visual = part.mesh?.visual;

  if (!visual) return null;

  const entry = entries.get(visual.key);

  if (!entry) void load(visual.key, part.simready?.url ?? '');

  if (entry?.status !== 'ready') return null;

  return entry.nodes.get(visual.node) ?? null;
}

export function useSimReadyVisualVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);

      return () => listeners.delete(cb);
    },
    () => version,
  );
}
