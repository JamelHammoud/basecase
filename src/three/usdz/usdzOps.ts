import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { reply } from '../../utils/workerRpc';

export interface UsdzMaterial {
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
}

export interface UsdzGeometry {
  id: string;
  positions: Float32Array;
  normals: Float32Array | null;
  index: Uint32Array | null;
}

export interface UsdzMesh {
  geometry: string;
  matrix: number[];
  material: UsdzMaterial;
}

export interface UsdzJob {
  geometries: UsdzGeometry[];
  meshes: UsdzMesh[];
}

const MM_TO_M = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);

function sequentialIndex(count: number) {
  const index = new Uint32Array(count);

  for (let i = 0; i < count; i++) index[i] = i;

  return index;
}

function flipWinding(index: Uint32Array) {
  for (let i = 0; i + 2 < index.length; i += 3) {
    const b = index[i + 1];

    index[i + 1] = index[i + 2];
    index[i + 2] = b;
  }
}

function bakedGeometry(source: UsdzGeometry, matrix: THREE.Matrix4) {
  const geometry = new THREE.BufferGeometry();
  const index = source.index ? source.index.slice() : sequentialIndex(source.positions.length / 3);

  geometry.setAttribute('position', new THREE.BufferAttribute(source.positions.slice(), 3));

  if (source.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals.slice(), 3));

  if (matrix.determinant() < 0) flipWinding(index);

  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.applyMatrix4(matrix);

  if (!source.normals) geometry.computeVertexNormals();

  return geometry;
}

function materialCache() {
  const cache = new Map<string, THREE.MeshStandardMaterial>();

  return ({ color, roughness, metalness, opacity }: UsdzMaterial) => {
    const key = `${color}|${roughness}|${metalness}|${opacity}`;
    let material = cache.get(key);

    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness, opacity, transparent: opacity < 1 });
      cache.set(key, material);
    }

    return material;
  };
}

function standOnFloor(meshes: THREE.Mesh[]) {
  const box = new THREE.Box3();

  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!);
  }

  const center = box.getCenter(new THREE.Vector3());

  for (const mesh of meshes) mesh.geometry.translate(-center.x, -box.min.y, -center.z);
}

export async function usdzOf({ geometries, meshes }: UsdzJob): Promise<Uint8Array> {
  const byId = new Map(geometries.map((g) => [g.id, g]));
  const materialOf = materialCache();
  const scene = new THREE.Scene();
  const built = meshes.flatMap(({ geometry, matrix, material }) => {
    const source = byId.get(geometry);

    if (!source) return [];

    const world = MM_TO_M.clone().multiply(new THREE.Matrix4().fromArray(matrix));

    return [new THREE.Mesh(bakedGeometry(source, world), materialOf(material))];
  });

  if (!built.length) return new Uint8Array();

  standOnFloor(built);
  built.forEach((mesh) => scene.add(mesh));

  const result = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true });

  return new Uint8Array(result);
}

export const usdzHandlers = {
  usdz: async (job: UsdzJob) => {
    const bytes = await usdzOf(job);

    return reply(bytes, [bytes.buffer]);
  },
};
