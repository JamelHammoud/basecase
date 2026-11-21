import * as THREE from 'three';
import type { ModelMaterial } from '../types/model';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { loadMeshScene, texturelessManager } from './robotImport/meshes';

export interface ModelMeshPiece {
  name: string;
  color: string;
  positions: Float32Array;
  material: ModelMaterial;
  colors?: Float32Array;
}

export interface ModelMeshJob {
  data: ArrayBuffer;
  path: string;
  resources?: { name: string; data: ArrayBuffer }[];
}

function objScene({ data, resources = [] }: ModelMeshJob) {
  const loader = new OBJLoader();
  const materials = resources.filter((r) => /\.mtl$/i.test(r.name));
  const creator = new MTLLoader(texturelessManager()).parse(
    materials.map((m) => new TextDecoder().decode(m.data)).join('\n'),
    '',
  );

  if (materials.length) loader.setMaterials(creator);

  return loader.parse(new TextDecoder().decode(data));
}

function localResources(job: ModelMeshJob) {
  const urls: string[] = [];
  const manager = texturelessManager();

  manager.setURLModifier((url) => {
    if (/^(data:|blob:)/.test(url)) return url;

    const name = decodeURIComponent(url).replace(/^\.\//, '');
    const relative = new URL(name, `https://model.invalid/${job.path}`).pathname.slice(1);
    const external = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(name);
    const file = external
      ? undefined
      : job.resources?.find((resource) => resource.name === relative || resource.name === name);

    if (!file) throw new Error(`Include ${name} with ${job.path}.`);

    const local = URL.createObjectURL(new Blob([file.data]));

    urls.push(local);

    return local;
  });

  return { manager, dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

function reverseWinding(positions: Float32Array) {
  for (let i = 0; i < positions.length; i += 9) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + 3 + axis];

      positions[i + 3 + axis] = positions[i + 6 + axis];
      positions[i + 6 + axis] = value;
    }
  }
}

function materialProperties(source: THREE.Material | undefined): ModelMaterial {
  const standard = source as THREE.MeshStandardMaterial | undefined;

  return {
    name: source?.name ?? '',
    roughness: standard?.roughness ?? 0.6,
    metalness: standard?.metalness ?? 0,
    opacity: source?.opacity ?? 1,
    transparent: source?.transparent ?? false,
    doubleSided: source?.side === THREE.DoubleSide,
  };
}

function meshPiece(mesh: THREE.Mesh, range: { start: number; count: number; materialIndex?: number }) {
  const material = Array.isArray(mesh.material) ? mesh.material[range.materialIndex ?? 0] : mesh.material;
  const color = material && 'color' in material ? (material.color as THREE.Color) : new THREE.Color('#d4d4d4');
  const source = mesh.geometry;
  const positions = new Float32Array(range.count * 3);
  const point = new THREE.Vector3();
  const sourceColors = source.getAttribute('color');
  const colors = sourceColors ? new Float32Array(range.count * 3) : undefined;

  for (let i = 0; i < range.count; i++) {
    const index = source.index ? source.index.getX(range.start + i) : range.start + i;

    if (colors) colors.set([sourceColors.getX(index), sourceColors.getY(index), sourceColors.getZ(index)], i * 3);

    mesh
      .getVertexPosition(index, point)
      .applyMatrix4(mesh.matrixWorld)
      .toArray(positions, i * 3);
  }

  if (mesh.matrixWorld.determinant() < 0) reverseWinding(positions);

  if (colors && mesh.matrixWorld.determinant() < 0) reverseWinding(colors);

  return {
    name: mesh.name,
    color: `#${color.getHexString()}`,
    positions,
    colors,
    material: materialProperties(material),
  };
}

export function modelPieces(root: THREE.Object3D): ModelMeshPiece[] {
  const pieces: ModelMeshPiece[] = [];

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute('position')) return;

    if (object instanceof THREE.SkinnedMesh) object.skeleton.update();

    const count = object.geometry.index?.count ?? object.geometry.getAttribute('position').count;
    const groups = object.geometry.groups.length ? object.geometry.groups : [{ start: 0, count }];

    for (const group of groups) {
      if (!group.count) continue;

      pieces.push(meshPiece(object, group));
    }
  });

  return pieces;
}

export async function loadModelMesh(job: ModelMeshJob): Promise<ModelMeshPiece[]> {
  const resources = localResources(job);

  try {
    const root = /\.obj$/i.test(job.path)
      ? objScene(job)
      : await loadMeshScene(job.data, job.path, { manager: resources.manager, sceneAxes: true });

    return root ? modelPieces(root) : [];
  } finally {
    resources.dispose();
  }
}
