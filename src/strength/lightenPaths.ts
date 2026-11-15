import { frozenQuery } from './lightenFrozen';
import type { LightenFrozen } from './lightenTypes';
import { cellCenter, type HexMesh } from './mesh';
import { neighbours } from './voxels';

interface Entry {
  cell: number;
  cost: number;
}

class CostQueue {
  private readonly entries: Entry[] = [];

  push(entry: Entry): void {
    const entries = this.entries;
    let at = entries.length;

    entries.push(entry);

    while (at > 0) {
      const parent = (at - 1) >> 1;

      if (entries[parent].cost <= entry.cost) break;

      entries[at] = entries[parent];
      at = parent;
    }

    entries[at] = entry;
  }

  pop(): Entry | undefined {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();

    if (!last || entries.length === 0) return first;

    let at = 0;

    while (at * 2 + 1 < entries.length) {
      const left = at * 2 + 1;
      const right = left + 1;
      const child = right < entries.length && entries[right].cost < entries[left].cost ? right : left;

      if (entries[child].cost >= last.cost) break;

      entries[at] = entries[child];
      at = child;
    }

    entries[at] = last;

    return first;
  }
}

export function interfacePaths(mesh: HexMesh, density: Float64Array, regions: LightenFrozen): Uint8Array {
  const { grid } = mesh;
  const isFrozen = frozenQuery(regions);
  const frozen = Uint8Array.from(grid.solid, (value, cell) => (value && isFrozen(cellCenter(grid, cell)) ? 1 : 0));
  const root = frozen.indexOf(1);
  const paths = new Uint8Array(grid.solid.length);

  if (root < 0) throw new Error('The mounting surfaces do not touch the printed part.');

  const resistance = new Float64Array(grid.solid.length).fill(Infinity);
  const distance = new Float64Array(grid.solid.length).fill(Infinity);
  const previous = new Int32Array(grid.solid.length).fill(-1);
  const queue = new CostQueue();

  mesh.cells.forEach((cell, e) => (resistance[cell] = 1 / (0.001 + density[e] ** 3)));
  distance[root] = 0;
  queue.push({ cell: root, cost: 0 });

  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    if (entry.cost > distance[entry.cell]) continue;

    for (const other of neighbours(grid, entry.cell)) {
      const cost = entry.cost + (resistance[entry.cell] + resistance[other]) / 2;

      if (!grid.solid[other] || cost >= distance[other]) continue;

      distance[other] = cost;
      previous[other] = entry.cell;
      queue.push({ cell: other, cost });
    }
  }

  paths[root] = 1;
  frozen.forEach((value, cell) => {
    if (!value) return;

    if (!Number.isFinite(distance[cell])) throw new Error('The original mounting surfaces are disconnected.');

    for (let at = cell; at >= 0 && !paths[at]; at = previous[at]) paths[at] = 1;
  });

  return paths;
}
