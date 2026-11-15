import { describe, expect, it, vi } from 'vitest';
import { elasticPattern } from './elasticPattern';
import { hexMesh } from './mesh';
import type { V3 } from './material';

function fixture(n: V3, seed = 0) {
  return hexMesh({
    n,
    h: [1, 1.5, 2],
    origin: [-2, 3, 1],
    solid: Uint8Array.from({ length: n[0] * n[1] * n[2] }, (_, i) => Number(!seed || (i * 13 + seed) % 7 > 1)),
  });
}

function referencePattern(nodes: Int32Array, count: number) {
  const neighbors = Array.from({ length: count }, () => new Set<number>());

  for (let e = 0; e < nodes.length; e += 8) {
    const element = Array.from(nodes.slice(e, e + 8));

    for (const row of element) for (const col of element) neighbors[row].add(col);
  }

  const rows = neighbors.map((row) => [...row].sort((a, b) => a - b));
  const starts = [0];

  for (const row of rows) starts.push(starts[starts.length - 1] + row.length);

  const destinations = rows.map((row, i) => new Map(row.map((col, k) => [col, starts[i] + k])));
  const slots: number[] = [];

  for (let e = 0; e < nodes.length; e += 8)
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) slots.push(destinations[nodes[e + a]].get(nodes[e + b])!);

  return { rowStart: Int32Array.from(starts), cols: Int32Array.from(rows.flat()), slots: Int32Array.from(slots) };
}

describe('elastic neighbor collection', () => {
  it('matches set connectivity across dense, sparse, disconnected and singleton-axis grids', () => {
    for (let seed = 0; seed < 120; seed++) {
      const n: V3 = [1 + (seed % 5), 1 + (Math.floor(seed / 5) % 4), 1 + (Math.floor(seed / 20) % 3)];
      const mesh = fixture(n, seed % 8);
      const count = mesh.positions.length / 3 + (seed % 3);
      const nodes = mesh.nodes.map((node) => count - 1 - node);
      const saved = nodes.slice();

      expect(elasticPattern(nodes, count)).toEqual(referencePattern(nodes, count));
      expect(nodes).toEqual(saved);
    }
  });

  it('retains all 27 neighbors of an interior node and removes repeated element contributions', () => {
    const mesh = fixture([2, 2, 2]);
    const count = mesh.positions.length / 3;
    const nodes = Int32Array.from([...mesh.nodes, ...mesh.nodes]);
    const pattern = elasticPattern(nodes, count);
    const sizes = Array.from({ length: count }, (_, i) => pattern.rowStart[i + 1] - pattern.rowStart[i]);

    expect(Math.max(...sizes)).toBe(27);
    expect(pattern).toEqual(referencePattern(nodes, count));
    expect(pattern.cols).toEqual(elasticPattern(mesh.nodes, count).cols);
  });

  it('handles empty input, unused nodes, repeated corners, edited views and independent results', () => {
    for (const count of [0, 4])
      expect(elasticPattern(new Int32Array(), count)).toEqual(referencePattern(new Int32Array(), count));

    const source = Int32Array.of(99, 7, 7, 5, 5, 3, 3, 1, 1, 99);
    const nodes = source.subarray(1, 9);
    const before = source.slice();
    const first = elasticPattern(nodes, 10);
    const saved = structuredClone(first);

    expect(first).toEqual(referencePattern(nodes, 10));
    expect(source).toEqual(before);
    nodes[0] = 9;

    expect(elasticPattern(nodes, 10)).toEqual(referencePattern(nodes, 10));
    expect(first).toEqual(saved);
    expect(source[0]).toBe(99);
    expect(source[9]).toBe(99);
  });

  it.each([3, 6])('creates at most one sorting view per node on a 10 by 10 by %i grid', (depth) => {
    const mesh = fixture([10, 10, depth]);
    const count = mesh.positions.length / 3;
    const views = vi.spyOn(Int32Array.prototype, 'subarray');
    let calls: number;

    try {
      elasticPattern(mesh.nodes, count);
      calls = views.mock.calls.length;
    } finally {
      views.mockRestore();
    }

    expect(calls).toBeLessThanOrEqual(count);
  });
});
