import type { Cell } from './hexElement';
import type { V3 } from './material';
import { cellIndex, type VoxelGrid } from './voxels';
import { voxelNeighbours } from './voxelNeighbours';
import { screwRegion } from './screwRegion';

export interface ScrewLine {
  from: V3;
  to: V3;
  radius: number;
}

export interface HexMesh {
  grid: VoxelGrid;
  cells: Int32Array;
  nodes: Int32Array;
  positions: Float64Array;
}

const CORNERS: Cell[] = Array.from({ length: 8 }, (_, a) => [a & 1, (a >> 1) & 1, (a >> 2) & 1]);

export function hexMesh(grid: VoxelGrid, keep: (cell: number) => boolean = () => true): HexMesh {
  const [nx, ny] = grid.n;
  const nodeId = new Map<number, number>();
  const cells: number[] = [];
  const nodes: number[] = [];
  const positions: number[] = [];

  for (let c = 0; c < grid.solid.length; c++) {
    if (!grid.solid[c] || !keep(c)) continue;

    const i = c % nx;
    const j = Math.floor(c / nx) % ny;
    const k = Math.floor(c / (nx * ny));

    cells.push(c);

    for (const [dx, dy, dz] of CORNERS) {
      const key = ((k + dz) * (ny + 1) + (j + dy)) * (nx + 1) + (i + dx);
      let id = nodeId.get(key);

      if (id === undefined) {
        id = positions.length / 3;
        nodeId.set(key, id);
        positions.push(
          grid.origin[0] + (i + dx) * grid.h[0],
          grid.origin[1] + (j + dy) * grid.h[1],
          grid.origin[2] + (k + dz) * grid.h[2],
        );
      }

      nodes.push(id);
    }
  }

  return {
    grid,
    cells: Int32Array.from(cells),
    nodes: Int32Array.from(nodes),
    positions: Float64Array.from(positions),
  };
}

export function nodesNear(mesh: HexMesh, lines: ScrewLine[], slack: number): Uint8Array {
  const out = new Uint8Array(mesh.positions.length / 3);
  const regions = lines.map((line) => screwRegion(line, slack));

  for (let n = 0; n < out.length; n++) {
    const p: V3 = [mesh.positions[n * 3], mesh.positions[n * 3 + 1], mesh.positions[n * 3 + 2]];

    out[n] = regions.some((contains) => contains(p)) ? 1 : 0;
  }

  return out;
}

function labelComponent(grid: VoxelGrid, label: Int32Array, start: number, neighbours: (cell: number) => number[]) {
  const stack = [start];
  const component = label[start];

  while (stack.length) {
    const at = stack.pop()!;

    for (const m of neighbours(at)) {
      if (!grid.solid[m] || label[m] >= 0) continue;

      label[m] = component;
      stack.push(m);
    }
  }
}

export function components(grid: VoxelGrid): Int32Array {
  const label = new Int32Array(grid.solid.length).fill(-1);
  const neighbours = voxelNeighbours(grid);
  let next = 0;

  for (let c = 0; c < grid.solid.length; c++) {
    if (!grid.solid[c] || label[c] >= 0) continue;

    label[c] = next;
    labelComponent(grid, label, c, neighbours);

    next++;
  }

  return label;
}

export const cellCenter = (grid: VoxelGrid, c: number): V3 => {
  const [nx, ny] = grid.n;
  const ijk = [c % nx, Math.floor(c / nx) % ny, Math.floor(c / (nx * ny))];

  return [0, 1, 2].map((k) => grid.origin[k] + (ijk[k] + 0.5) * grid.h[k]) as V3;
};

export { cellIndex };
