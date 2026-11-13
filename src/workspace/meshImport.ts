import * as THREE from 'three';
import { geometryWorker } from '../three/geometryWorker';
import type { ScenePart } from '../types/robotics';
import { parseMeshFile } from '../utils/meshFile';
import { extensionOf } from './importRoute';
import { PRINTED_TAG } from './partFactories';
import type { Vec3 } from './types';

const Z_UP = new Set(['stl', '3mf', 'ply']);
const MM_PER_UNIT: Record<string, number> = { glb: 1000, gltf: 1000, dae: 1000, fbx: 10 };
const SMALLEST_MM = 1;
const IMPORTED_COLOR = '#d4d4d4';

export function importMatrix(ext: string): THREE.Matrix4 {
  const scale = MM_PER_UNIT[ext] ?? 1;
  const matrix = new THREE.Matrix4().makeScale(scale, scale, scale);

  return Z_UP.has(ext) ? new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(matrix) : matrix;
}

async function placedSoup(positions: Float32Array, ext: string) {
  const placed = await geometryWorker.call(
    'linkSoup',
    [{ positions, matrix: importMatrix(ext).toArray() }],
    [positions.buffer],
  );
  const extent = Math.max(...placed.max.map((v, i) => v - placed.min[i]));

  if (extent >= SMALLEST_MM || extent === 0) return placed.soup;

  const metres = new THREE.Matrix4().makeScale(1000, 1000, 1000).toArray();
  const scaled = await geometryWorker.call(
    'linkSoup',
    [{ positions: placed.soup, matrix: metres }],
    [placed.soup.buffer],
  );

  return scaled.soup;
}

const round = (v: number) => Math.round(v * 100) / 100;

export interface MeshImport {
  file: File;
  id: string;
  at?: Vec3 | null;
}

export async function meshPartFromFile({ file, id, at }: MeshImport): Promise<ScenePart> {
  const ext = extensionOf(file.name);
  const positions = await parseMeshFile(await file.arrayBuffer(), file.name);

  if (!positions?.length) throw new Error('No triangles found.');

  const soup = await placedSoup(positions, ext);
  const mesh = await geometryWorker.call('linkMesh', { soup, target: soup.length / 9 }, [soup.buffer]);
  const baseSize: Vec3 = [Math.max(mesh.size[0], 0.01), Math.max(mesh.size[1], 0.01), Math.max(mesh.size[2], 0.01)];
  const base = at ?? [0, 0, 0];
  const name = file.name.replace(/\.[^.]+$/, '') || 'Mesh';

  return {
    id,
    name,
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [base[0], round(base[1] + baseSize[1] / 2), base[2]],
    rotation: [0, 0, 0],
    dimensions: { width: round(baseSize[0]), height: round(baseSize[1]), depth: round(baseSize[2]) },
    color: IMPORTED_COLOR,
    note: '',
    mechanicalTag: PRINTED_TAG,
    visible: true,
    locked: false,
    mesh: { positions: mesh.positions, indices: mesh.indices, baseSize, source: file.name, file: file.name },
  };
}
