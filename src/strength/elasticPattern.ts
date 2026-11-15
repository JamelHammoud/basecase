export interface BlockMatrix {
  rowStart: Int32Array;
  cols: Int32Array;
  values: Float64Array;
}

const MAX_NEIGHBOURS = 27;

function addNeighbour(near: Int32Array, size: Int32Array, i: number, j: number): void {
  const row = near.subarray(i * MAX_NEIGHBOURS, i * MAX_NEIGHBOURS + size[i]);

  if (!row.includes(j)) near[i * MAX_NEIGHBOURS + size[i]++] = j;
}

function pattern(nodes: Int32Array, count: number): { rowStart: Int32Array; cols: Int32Array } {
  const near = new Int32Array(count * MAX_NEIGHBOURS);
  const size = new Int32Array(count);

  for (let e = 0; e < nodes.length; e += 8)
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) addNeighbour(near, size, nodes[e + a], nodes[e + b]);

  const rowStart = new Int32Array(count + 1);

  for (let i = 0; i < count; i++) rowStart[i + 1] = rowStart[i] + size[i];

  const cols = new Int32Array(rowStart[count]);

  for (let i = 0; i < count; i++)
    cols.set(near.subarray(i * MAX_NEIGHBOURS, i * MAX_NEIGHBOURS + size[i]).sort(), rowStart[i]);

  return { rowStart, cols };
}

export function blockAt(m: Pick<BlockMatrix, 'rowStart' | 'cols'>, i: number, j: number): number {
  for (let k = m.rowStart[i]; k < m.rowStart[i + 1]; k++) if (m.cols[k] === j) return k;

  return -1;
}

export interface ElasticPattern {
  rowStart: Int32Array;
  cols: Int32Array;
  slots: Int32Array;
}

export function elasticPattern(nodes: Int32Array, count: number): ElasticPattern {
  const shape = pattern(nodes, count);
  const slots = new Int32Array(nodes.length * 8);

  for (let e = 0; e < nodes.length / 8; e++)
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) slots[e * 64 + a * 8 + b] = blockAt(shape, nodes[e * 8 + a], nodes[e * 8 + b]);

  return { ...shape, slots };
}

export function assembleElastic(pattern: ElasticPattern, scale: Float64Array, stiffness: Float64Array): BlockMatrix {
  const values = new Float64Array(pattern.cols.length * 9);

  for (let e = 0; e < scale.length; e++) {
    for (let r = 0; r < 24; r++) {
      const s = scale[e];

      for (let c = 0; c < 24; c++)
        values[pattern.slots[e * 64 + ((r / 3) | 0) * 8 + ((c / 3) | 0)] * 9 + (r % 3) * 3 + (c % 3)] +=
          s * stiffness[r * 24 + c];
    }
  }

  return { rowStart: pattern.rowStart, cols: pattern.cols, values };
}
