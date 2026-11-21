import * as THREE from 'three';
import { geometryWorker } from '../three/geometryWorker';
import type { ScenePart } from '../types/robotics';
import { loadModelMesh, type ModelMeshPiece } from '../utils/modelMesh';
import { centerSizeRange } from '../utils/centerSizeRange';
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

  return Z_UP.has(ext)
    ? new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1).multiply(matrix)
    : matrix;
}

async function placedPieces(pieces: ModelMeshPiece[], ext: string) {
  const placed = await Promise.all(
    pieces.map(async (piece) => ({
      ...piece,
      ...(await geometryWorker.call(
        'linkSoup',
        [{ positions: piece.positions, matrix: importMatrix(ext).toArray() }],
        [piece.positions.buffer],
      )),
    })),
  );
  const min = [0, 1, 2].map((axis) => placed.reduce((min, p) => Math.min(min, p.min[axis]), Infinity));
  const max = [0, 1, 2].map((axis) => placed.reduce((max, p) => Math.max(max, p.max[axis]), -Infinity));
  const extent = Math.max(...max.map((v, i) => v - min[i]));
  const scale = extent > 0 && extent < SMALLEST_MM ? 1000 : 1;

  return Promise.all(
    placed.map(async (piece) => {
      const soup = piece.soup;
      const scaled =
        scale === 1
          ? piece
          : await geometryWorker.call(
              'linkSoup',
              [{ positions: soup, matrix: new THREE.Matrix4().makeScale(scale, scale, scale).toArray() }],
              [soup.buffer],
            );
      const mesh = await geometryWorker.call(
        'linkMesh',
        { soup: scaled.soup, target: scaled.soup.length / 9, preserveDetail: true, colors: piece.colors },
        [scaled.soup.buffer, ...(piece.colors ? [piece.colors.buffer] : [])],
      );

      return { ...mesh, name: piece.name, color: piece.color, material: piece.material };
    }),
  );
}

interface ModelImport {
  file: File;
  newId: (prefix: string) => string;
  at?: Vec3 | null;
  resources?: File[];
}

export async function meshPartsFromFile({ file, newId, at, resources = [] }: ModelImport): Promise<ScenePart[]> {
  const ext = extensionOf(file.name);
  const data = await file.arrayBuffer();
  const job = {
    data,
    path: file.name,
    resources: await Promise.all(
      resources.map(async (resource) => ({
        name: resource.webkitRelativePath || resource.name,
        data: await resource.arrayBuffer(),
      })),
    ),
  };
  const pieces = /\.(dae|3mf)$/i.test(file.name)
    ? await loadModelMesh(job)
    : await geometryWorker.call('parseModel', job, [data, ...job.resources.map((r) => r.data)]);

  if (!pieces.length) throw new Error('No triangles found.');

  const meshes = await placedPieces(pieces, ext);
  const bounds = [0, 1, 2].map((axis) =>
    centerSizeRange(
      meshes,
      (m) => m.center[axis],
      (m) => m.size[axis],
    ),
  );
  const mid = bounds.map(({ min, max }) => (min + max) / 2);
  const base = at ?? [0, 0, 0];
  const name =
    file.name
      .split('/')
      .at(-1)!
      .replace(/\.[^.]+$/, '') || 'Mesh';
  const group = meshes.length > 1 ? { group: { id: newId('group'), name } } : {};

  return meshes.map((mesh, i) => {
    const baseSize = mesh.size.map((v) => (v > 0 ? v : 0.01)) as Vec3;

    return {
      id: newId('mesh'),
      name: mesh.name || (meshes.length > 1 ? `${name} ${i + 1}` : name),
      kind: 'mesh',
      category: 'structure',
      role: 'solid',
      position: [
        base[0] + mesh.center[0] - mid[0],
        base[1] + mesh.center[1] - bounds[1].min,
        base[2] + mesh.center[2] - mid[2],
      ],
      rotation: [0, 0, 0],
      dimensions: { width: baseSize[0], height: baseSize[1], depth: baseSize[2] },
      color: mesh.color || IMPORTED_COLOR,
      note: '',
      mechanicalTag: PRINTED_TAG,
      visible: true,
      locked: false,
      mesh: {
        positions: mesh.positions,
        indices: mesh.indices,
        baseSize,
        source: file.name,
        file: file.name,
        material: mesh.material,
        colors: mesh.colors,
      },
      ...group,
    };
  });
}
