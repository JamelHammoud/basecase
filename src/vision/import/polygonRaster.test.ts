import { afterEach, describe, expect, it, vi } from 'vitest';
import { boxPixels, polygonPixels } from './sourceGeometry';

function fullHeightPixels(rings: number[][], width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height);

  for (const ring of rings) fillFullHeight(pixels, ring, width, height);

  return pixels;
}

function fillFullHeight(pixels: Uint8Array, ring: number[], width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    const intersections: number[] = [];

    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      const [ax, ay, bx, by] = [ring[i], ring[i + 1], ring[next], ring[next + 1]];

      if (ay > y + 0.5 === by > y + 0.5) continue;

      intersections.push(ax + ((y + 0.5 - ay) * (bx - ax)) / (by - ay));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i] - 0.5));
      const right = Math.min(width, Math.ceil(intersections[i + 1] - 0.5));

      if (right > left) pixels.fill(1, y * width + left, y * width + right);
    }
  }
}

afterEach(() => vi.restoreAllMocks());

describe('bounded polygon rasterization', () => {
  it('matches full-height rasterization across clipped, intersecting and reversed rings', () => {
    let state = 5719;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

      return state / 2 ** 32;
    };

    for (let sample = 0; sample < 600; sample++) {
      const width = 1 + Math.floor(random() * 32);
      const height = 1 + Math.floor(random() * 40);
      const rings = Array.from({ length: 1 + (sample % 3) }, () =>
        Array.from(
          { length: 6 + 2 * Math.floor(random() * 15) },
          (_, i) => Math.round((random() * 2 - 0.5) * (i % 2 ? height : width) * 4) / 4,
        ),
      );
      const before = structuredClone(rings);

      expect(polygonPixels(rings, width, height)).toEqual(fullHeightPixels(rings, width, height));
      expect(rings).toEqual(before);
    }
  });

  it.each([-1_000_000, -1, -0.5, -Number.EPSILON, 0, 0.5, 0.5 - Number.EPSILON, 0.5 + Number.EPSILON, 1, 7.5, 8, 9])(
    'retains pixel-center boundaries at y = %s',
    (y) => {
      const rings = [
        [0.5, y, 7.5, y, 7.5, y + 0.5, 4, y + 1, 0.5, y + 0.5],
        [0, y, 8, y, 8, y, 0, y],
      ];

      expect(polygonPixels(rings, 8, 8)).toEqual(fullHeightPixels(rings, 8, 8));
    },
  );

  it('keeps repeated vertices, winding, union order and later edits independent', () => {
    const rings = [
      [1, 1, 7, 1, 7, 7, 7, 7, 1, 7, 1, 1],
      [5, 5, 3, 5, 3, 3, 5, 3],
    ];
    const first = polygonPixels(rings, 8, 8);

    expect(first).toEqual(boxPixels([1, 1, 6, 6], 8, 8));
    rings[0][1] = 4.5;
    expect(polygonPixels(rings, 8, 8)).toEqual(fullHeightPixels(rings, 8, 8));
    expect(first).toEqual(boxPixels([1, 1, 6, 6], 8, 8));
    first.fill(0);
    expect(polygonPixels(rings, 8, 8)).toEqual(fullHeightPixels(rings, 8, 8));
    expect(polygonPixels([], 8, 8)).toEqual(new Uint8Array(64));
  });

  it.each([300, 600])('scans only four covered rows in a %i-row image with one crossing buffer', (height) => {
    const rings = [[1, 120.25, 7, 120.25, 7, 123.75, 1, 123.75]];
    const expected = fullHeightPixels(rings, 8, height);
    const sort = vi.spyOn(Array.prototype, 'sort');
    const pixels = polygonPixels(rings, 8, height);
    const calls = sort.mock.calls.length;
    const buffers = new Set(sort.mock.contexts);

    sort.mockRestore();
    expect(pixels).toEqual(expected);
    expect(calls).toBe(4);
    expect(buffers.size).toBe(1);
  });

  it('does no crossing work for rings above or below the image', () => {
    const sort = vi.spyOn(Array.prototype, 'sort');
    const pixels = polygonPixels(
      [
        [0, -3, 8, -3, 4, -1],
        [0, 9, 8, 9, 4, 10],
      ],
      8,
      8,
    );
    const calls = sort.mock.calls.length;

    sort.mockRestore();
    expect(pixels).toEqual(new Uint8Array(64));
    expect(calls).toBe(0);
  });

  it.each(
    [
      [[0, 9, 1, 9, 1, 1_000_001]],
      [[0, -1_000_001, 1, -9, 1, -8]],
      [[0, 0, 1, 1, NaN, 2]],
      [[0, 0, 1, 1, Infinity, 2]],
      [[0, 0, 1, 1, 2]],
      [Array.from({ length: 100_002 }, () => 0)],
    ].map((rings) => ({ rings })),
  )('retains geometry validation before skipping offscreen rows', ({ rings }) => {
    expect(() => polygonPixels(rings, 8, 8)).toThrow();
  });

  it('retains the original height-based work cap for a small in-frame polygon', () => {
    expect(() => polygonPixels([[0, 0, 1, 0, 1, 1]], 1, 16_777_216)).toThrow();
  });
});
