import { BufferAttribute, BufferGeometry } from 'three';
import { refuse } from '../cases/validate';
import { meshBounds } from '../cases/worldImport/geometry';
import type { WorldHull } from '../cases/worldDecomposition';
import type { WorldMesh } from '../cases/worldImportTypes';
import { cellKey, sortedCells } from './mapWorldCells';

export interface CellBox {
  min: number[];
  max: number[];
}

function rowPresent(cells: Set<string>, min: number[], max: number[], axis: number): boolean {
  const low = [...min];
  const high = [...max];

  low[axis] = max[axis] + 1;
  high[axis] = low[axis];

  return rowCells(low, high).every((cell) => cells.has(cellKey(cell)));
}

function rowCells(min: number[], max: number[]): number[][] {
  const cells: number[][] = [];

  for (let z = min[2]; z <= max[2]; z++)
    for (let y = min[1]; y <= max[1]; y++) for (let x = min[0]; x <= max[0]; x++) cells.push([x, y, z]);

  return cells;
}

function takeBox(cells: Set<string>, min: number[]): CellBox {
  const max = [...min];

  for (let axis = 0; axis < 3; axis++) while (rowPresent(cells, min, max, axis)) max[axis]++;

  for (let z = min[2]; z <= max[2]; z++)
    for (let y = min[1]; y <= max[1]; y++) for (let x = min[0]; x <= max[0]; x++) cells.delete(cellKey([x, y, z]));

  return { min, max };
}

export function mergeCells(cells: Set<string>, limit: number): CellBox[] {
  const remaining = new Set(cells);
  const boxes: CellBox[] = [];

  for (const cell of sortedCells(cells)) {
    if (!remaining.has(cellKey(cell))) continue;

    boxes.push(takeBox(remaining, cell));

    if (boxes.length > limit) refuse('Scan reconstruction', 'exceeds its collision pieces budget of 64');
  }

  return boxes;
}

const TRIANGLES = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

export function boxHull({ min, max }: CellBox): WorldHull {
  const positions = Float32Array.from([
    min[0],
    min[1],
    min[2],
    max[0],
    min[1],
    min[2],
    max[0],
    max[1],
    min[2],
    min[0],
    max[1],
    min[2],
    min[0],
    min[1],
    max[2],
    max[0],
    min[1],
    max[2],
    max[0],
    max[1],
    max[2],
    min[0],
    max[1],
    max[2],
  ]);

  return { positions, indices: Uint32Array.from(TRIANGLES) };
}

export function boxesMesh(pieces: WorldHull[]): WorldMesh {
  const positions = new Float32Array(pieces.length * 24);
  const indices = new Uint32Array(pieces.length * 36);

  pieces.forEach((piece, i) => {
    positions.set(piece.positions, i * 24);
    indices.set(
      piece.indices.map((index) => index + i * 8),
      i * 36,
    );
  });

  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3));

  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const normals = new Float32Array(geometry.getAttribute('normal').array);

  geometry.dispose();

  return {
    positions,
    indices,
    normals,
    bounds: meshBounds(positions),
    groups: [{ start: 0, count: indices.length, material: 0 }],
    materials: [{ name: 'Map', color: [0.45, 0.45, 0.45, 1], roughness: 1, metalness: 0 }],
  };
}
