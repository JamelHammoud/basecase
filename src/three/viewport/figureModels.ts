import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FigureKind } from './types';

const SMOOTH_ANGLE = THREE.MathUtils.degToRad(60);

const loads = new Map<FigureKind, Promise<THREE.BufferGeometry>>();

export const figureUrl = (kind: FigureKind) => `${import.meta.env.BASE_URL}figures/${kind}.glb`;

function meshGeometries(scene: THREE.Object3D): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];

  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) return;

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    geometry.setIndex(mesh.geometry.getIndex()?.clone() ?? null);
    geometry.applyMatrix4(mesh.matrixWorld);
    out.push(geometry.index ? geometry.toNonIndexed() : geometry);
  });

  return out;
}

export function standFigure(geometry: THREE.BufferGeometry, kind: FigureKind): THREE.BufferGeometry {
  geometry.computeBoundingBox();

  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;

  geometry.translate(-center.x, -box.min.y, -center.z);

  if (kind === 'human') geometry.scale(1 / height, 1 / height, 1 / height);

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export async function parseFigure(data: ArrayBuffer, kind: FigureKind): Promise<THREE.BufferGeometry> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const pieces = meshGeometries(gltf.scene);
  const merged = mergeGeometries(pieces);

  pieces.forEach((piece) => piece.dispose());

  if (!merged) throw new Error(`The ${kind} figure has no meshes.`);

  const smooth = toCreasedNormals(merged, SMOOTH_ANGLE);

  merged.dispose();

  return standFigure(smooth, kind);
}

export function loadFigure(kind: FigureKind): Promise<THREE.BufferGeometry> {
  const existing = loads.get(kind);

  if (existing) return existing;

  const load = fetch(figureUrl(kind)).then(async (res) => {
    if (!res.ok) throw new Error(`Couldn't load the ${kind} figure (${res.status}).`);

    return parseFigure(await res.arrayBuffer(), kind);
  });

  loads.set(kind, load);
  load.catch(() => loads.delete(kind));

  return load;
}
