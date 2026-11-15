import { describe, expect, it } from 'vitest';
import { creaseEdgesOnly } from './creaseEdges';

const seam = [0, 0, 0, 1, 0, 0];
const boundary = [0, 1, 0, 0, 0, 0];
const unknown = [8, 8, 8, 9, 9, 9];

function folded(degrees: number) {
  const angle = (degrees * Math.PI) / 180;

  return {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -Math.cos(angle), Math.sin(angle)],
    indices: [0, 1, 2, 1, 0, 3],
  };
}

function grid(size: number) {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) positions.push(x, y, 0);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = y * (size + 1) + x;
      const b = a + 1;
      const c = a + size + 1;

      indices.push(a, b, c, b, c + 1, c);
    }
  }

  return { positions, indices };
}

describe('CAD crease edges', () => {
  it.each([0, 19, 21, 90, 180])('filters a %s degree seam while retaining boundaries and unknown edges', (angle) => {
    const { positions, indices } = folded(angle);
    const edges = [...unknown, ...seam, ...boundary, ...seam];
    const before = structuredClone({ positions, indices, edges });
    const expected = angle < 20 ? [...unknown, ...boundary] : edges;

    expect(creaseEdgesOnly(edges, positions, indices)).toEqual(expected);
    expect({ positions, indices, edges }).toEqual(before);
  });

  it.each([0, 0.004, 0.006])('matches split vertex indices at the existing rounding precision for %s mm', (offset) => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, offset, 0, 0, 1 + offset, 0, 0, 0, -1, 0];
    const indices = [0, 1, 2, 4, 3, 5];

    expect(creaseEdgesOnly(seam, positions, indices)).toEqual(offset < 0.005 ? [] : seam);
  });

  it('retains non-manifold and degenerate seams', () => {
    const { positions, indices } = folded(0);

    expect(creaseEdgesOnly(seam, positions, [...indices, 0, 1, 2])).toEqual(seam);
    expect(creaseEdgesOnly(seam, positions, [0, 1, 0])).toEqual(seam);
    expect(creaseEdgesOnly([...seam, 2], [], [])).toEqual(seam);
  });

  it('reads changed positions afresh on each call', () => {
    const { positions, indices } = folded(0);

    expect(creaseEdgesOnly(seam, positions, indices)).toEqual([]);
    positions[0] = 2;
    expect(creaseEdgesOnly(seam, positions, indices)).toEqual(seam);
  });

  it.each([16, 32])('bounds coordinate reads for an indexed grid with %s cells per side', (size) => {
    const { positions, indices } = grid(size);
    let reads = 0;
    const counted = positions.map((value, index) => {
      Object.defineProperty(positions, index, {
        get: () => {
          reads++;

          return value;
        },
      });

      return value;
    });
    const edges = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0];

    expect(creaseEdgesOnly(edges, positions, indices)).toEqual(edges.slice(0, 6));
    expect(reads).toBeLessThan(indices.length * 4);
    expect(positions).toEqual(counted);
  });
});
