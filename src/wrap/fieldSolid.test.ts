import { describe, expect, it } from 'vitest';
import { merged } from './fieldSolid';
import type { V3 } from './solidField';
import type { Bounds } from './vec';

function previousMerged(boxes: Array<Bounds | null>): Bounds | null {
  const present = boxes.filter((box): box is Bounds => box !== null);

  if (!present.length) return null;

  return {
    min: [0, 1, 2].map((k) => Math.min(...present.map((box) => box.min[k]))) as V3,
    max: [0, 1, 2].map((k) => Math.max(...present.map((box) => box.max[k]))) as V3,
  };
}

describe('shell field bounds', () => {
  it('matches prior bounds across absent, degenerate and nonfinite boxes without sharing storage', () => {
    const boxes: Array<Bounds | null> = [null];
    const values = [-Infinity, -4.5, -0, 0, 8.25, Infinity, NaN];

    expect(merged([])).toBeNull();
    expect(merged(boxes)).toBeNull();

    for (let i = 0; i < 70; i++) {
      boxes.push({
        min: [values[i % 7], i - 8, -i],
        max: [values[(i + 2) % 7], i + 4, i * 2],
      });

      const source = structuredClone(boxes);

      for (let start = 0; start < boxes.length; start++) {
        const subset = boxes.slice(start);
        const result = merged(subset);

        expect(result).toEqual(previousMerged(subset));

        if (result) result.min[0] = 123;

        expect(merged(subset)).toEqual(previousMerged(subset));
      }

      expect(boxes).toEqual(source);
    }
  });

  it('merges large bound collections without argument spreads and reads edits afresh', () => {
    const box: Bounds = { min: [-1, -2, -3], max: [4, 5, 6] };
    const boxes: Bounds[] = Array.from({ length: 160_000 }, () => box);
    const first = merged(boxes);

    expect(first).toEqual(box);
    box.max[1] = 12;
    expect(merged(boxes)).toEqual(box);
    expect(first?.max[1]).toBe(5);
  });
});
