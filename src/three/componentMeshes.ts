import * as THREE from 'three';
import { useSyncExternalStore } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

function finish(color: THREE.Color): { metalness: number; roughness: number } {
  const hsl = { h: 0, s: 0, l: 0 };

  color.getHSL(hsl, THREE.SRGBColorSpace);

  const gold = hsl.h > 0.08 && hsl.h < 0.17 && hsl.s > 0.35 && hsl.l > 0.35;
  const silver = hsl.s < 0.12 && hsl.l > 0.55 && hsl.l < 0.85;

  if (gold || silver) return { metalness: 0.75, roughness: 0.32 };

  return { metalness: 0.05, roughness: 0.55 };
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

    const gltf = await new GLTFLoader().parseAsync(await res.arrayBuffer(), '');
    const pieces: ComponentPiece[] = [];

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;

      if (!mesh.isMesh) return;

      const src = mesh.material as THREE.MeshStandardMaterial;
      let geo = mesh.geometry.clone();

      geo.applyMatrix4(mesh.matrixWorld);
      geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(30));
      geo.userData.shared = true;
      pieces.push({ geometry: geo, color: '#' + src.color.getHexString(THREE.SRGBColorSpace), ...finish(src.color) });
    });

    const edgeParts = pieces.map((p) => new THREE.EdgesGeometry(p.geometry, 35));
    const edges = edgeParts.length
      ? (mergeGeometries(edgeParts, false) ?? new THREE.BufferGeometry())
      : new THREE.BufferGeometry();

    edgeParts.forEach((g) => g.dispose());
    edges.userData.shared = true;

    const box = new THREE.Box3();

    pieces.forEach((p) => {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    });

    const s = box.getSize(new THREE.Vector3());
    const mesh: LoadedComponent = { pieces, edges, size: [s.x, s.y, s.z] };

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
