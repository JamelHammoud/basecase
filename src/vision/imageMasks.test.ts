import { describe, expect, it, vi } from 'vitest';
import type { ImageMask } from './frameSet';
import { decodeMask, encodeMask } from './imageMasks';

function previousDecode(mask: ImageMask): Uint8Array {
  const [height, width] = mask.size;
  const pixels = new Uint8Array(width * height);
  let offset = 0;

  mask.counts.forEach((count, run) => {
    for (let i = offset; i < offset + count; i++) pixels[(i % height) * width + Math.floor(i / height)] = run % 2;

    offset += count;
  });

  return pixels;
}

describe('COCO mask decoding', () => {
  it.each([1, 2, 3, 4])('recovers every binary image through three rows with width %i', (width) => {
    const mismatches: number[][] = [];

    for (let height = 1; height <= 3; height++) {
      for (let bits = 0; bits < 2 ** (width * height); bits++) {
        const pixels = Uint8Array.from({ length: width * height }, (_, i) => (bits >> i) & 1);
        const actual = decodeMask(encodeMask(pixels, width, height));

        if (actual.some((value, i) => value !== pixels[i])) mismatches.push([width, height, bits]);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('matches the previous decoder across generated runs and edited sources', () => {
    for (let fixture = 0; fixture < 160; fixture++) {
      const width = 1 + ((fixture * 37) % 71);
      const height = 1 + ((fixture * 19) % 83);
      const length = width * height;
      const pixels = Uint8Array.from({ length }, (_, i) => Number((i * 13 + fixture) % 31 < fixture % 32));
      const mask = encodeMask(pixels, width, height);
      const before = structuredClone(mask);

      expect(decodeMask(mask)).toEqual(previousDecode(mask));
      expect(mask).toEqual(before);

      mask.counts = [0, length];

      expect(decodeMask(mask)).toEqual(new Uint8Array(length).fill(1));
    }
  });

  it('crosses column boundaries within a foreground run and leaves independent outputs', () => {
    const mask: ImageMask = { size: [3, 4], counts: [2, 8, 2] };

    Object.freeze(mask.counts);
    Object.freeze(mask.size);
    Object.freeze(mask);

    const first = decodeMask(mask);
    const second = decodeMask(mask);

    expect(first).toEqual(new Uint8Array([0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0]));
    expect(second.buffer).not.toBe(first.buffer);
    first.fill(0);
    expect(second).toEqual(previousDecode(mask));
  });

  it('retains the existing traversal of sparse run arrays', () => {
    const counts = [0, 2, 1, 3];

    delete counts[2];

    const mask: ImageMask = { size: [1, 5], counts };

    expect(decodeMask(mask)).toEqual(previousDecode(mask));
  });

  it.each([300, 600])('rounds coordinates once per foreground run in a %i-pixel square', (side) => {
    const length = side * side;
    const masks: ImageMask[] = [
      { size: [side, side], counts: [length] },
      { size: [side, side], counts: [0, length] },
      { size: [side, side], counts: [side + 7, 2 * side + 3, length - 3 * side - 10] },
    ];

    for (const mask of masks) {
      const floor = vi.spyOn(Math, 'floor');
      let expected: Uint8Array;
      let actual: Uint8Array;
      let previousCalls: number;
      let currentCalls: number;

      try {
        expected = previousDecode(mask);
        previousCalls = floor.mock.calls.length;
        floor.mockClear();
        actual = decodeMask(mask);
        currentCalls = floor.mock.calls.length;
      } finally {
        floor.mockRestore();
      }

      expect(actual).toEqual(expected);
      expect(previousCalls).toBe(length);
      expect(currentCalls).toBe(Math.floor(mask.counts.length / 2));
    }
  });
});
