import { describe, expect, it } from 'vitest';
import { worldPieces } from './worldCollider';
import type { FixtureMesh } from './worldFixtures';
import { sceneMesh, testDecompose } from './worldTesting';

const BUDGET_MS = 10_000;

function tessellated(cells: number): FixtureMesh {
  const m: FixtureMesh = { positions: [], indices: [], colors: [] };
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const start = m.positions.length / 3;

    for (let i = 0; i <= cells; i++)
      for (let j = 0; j <= cells; j++) {
        const u = i / cells;

        m.positions.push(x0 + (x1 - x0) * u, (j / cells) * 2.5, z0 + (z1 - z0) * u + Math.sin(i * 7.1 + j) * 0.004);
      }

    for (let i = 0; i < cells; i++)
      for (let j = 0; j < cells; j++) {
        const q = start + i * (cells + 1) + j;

        m.indices.push(q, q + cells + 1, q + cells + 2, q, q + cells + 2, q + 1);
      }
  };

  wall(0, 0, 6, 0);
  wall(6, 0, 6, 5);
  wall(6, 5, 0, 5);
  wall(0, 5, 0, 0);

  return m;
}

describe('splitting a world into pieces', () => {
  it('decomposes a 200k-triangle room within 10 s', async () => {
    const room = tessellated(158);
    const decompose = await testDecompose();
    const started = performance.now();
    const pieces = worldPieces(sceneMesh(room), decompose);

    expect(room.indices.length / 3).toBeGreaterThanOrEqual(199_000);
    expect(pieces.length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });
});
