import { describe, expect, it, vi } from 'vitest';
import { borderPixels, floodPixels } from './pixelFlood';

function fill(width: number, height: number, blocked: (i: number) => boolean, starts = borderPixels(width, height)) {
  const visited = new Uint8Array(width * height);
  const pixels: number[] = [];

  floodPixels({ width, height, starts, visited, blocked, visit: (i) => pixels.push(i) });

  return pixels.sort((a, b) => a - b);
}

describe('pixel floods', () => {
  it('processes each open pixel once despite duplicate border seeds and converging paths', () => {
    const width = 64;
    const height = 32;
    const tested = vi.fn(() => false);
    const pop = vi.spyOn(Array.prototype, 'pop');
    let pixels: number[];
    let pops: number;

    try {
      pixels = fill(width, height, tested);
      pops = pop.mock.calls.length;
    } finally {
      pop.mockRestore();
    }

    expect(pixels).toEqual(Array.from({ length: width * height }, (_, i) => i));
    expect(tested).toHaveBeenCalledTimes(width * height);
    expect(pops).toBe(width * height);
  });

  it('tests blocked pixels once and keeps enclosed and diagonal regions separate', () => {
    const tested = vi.fn((i: number) => [1, 3, 5, 7].includes(i));

    expect(fill(3, 3, tested)).toEqual([0, 2, 6, 8]);
    expect(tested.mock.calls.map(([i]) => i).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(fill(3, 3, tested, [4])).toEqual([4]);
  });

  it('respects row boundaries and fills single rows, columns and pixels', () => {
    expect(fill(3, 2, () => false, [2])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(fill(3, 2, (i) => i === 1 || i === 5, [2])).toEqual([2]);
    expect(fill(1, 5, () => false)).toEqual([0, 1, 2, 3, 4]);
    expect(fill(5, 1, () => false)).toEqual([0, 1, 2, 3, 4]);
    expect(fill(1, 1, () => false)).toEqual([0]);
    expect(fill(1, 1, () => true)).toEqual([]);
  });

  it('shares visited state across distinct holes without counting foreground as a hole', () => {
    const visited = new Uint8Array(15);
    const counts: number[] = [];

    for (const start of [6, 8, 6]) {
      let count = 0;

      floodPixels({
        width: 5,
        height: 3,
        starts: [start],
        visited,
        blocked: (i) => i !== 6 && i !== 8,
        visit: () => {
          count++;
        },
      });
      counts.push(count);
    }

    expect(counts).toEqual([1, 1, 0]);
  });
});
