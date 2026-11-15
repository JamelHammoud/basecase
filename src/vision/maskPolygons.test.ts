import { describe, expect, it, vi } from 'vitest';
import { decodeMask, encodeMask, maskBox, maskPolygons } from './imageMasks';

function contains(polygon: number[], x: number, y: number): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const crosses = polygon[i + 1] > y !== polygon[j + 1] > y;
    const crossingX =
      ((polygon[j] - polygon[i]) * (y - polygon[i + 1])) / (polygon[j + 1] - polygon[i + 1]) + polygon[i];

    if (crosses && x < crossingX) inside = !inside;
  }

  return inside;
}

function polygonMask(polygons: number[][], width = 3, height = 3): Uint8Array {
  return Uint8Array.from(
    { length: width * height },
    (_, i) => polygons.filter((p) => contains(p, (i % width) + 0.5, Math.floor(i / width) + 0.5)).length % 2,
  );
}

function signedArea(polygon: number[]): number {
  let area = 0;

  for (let i = 0; i < polygon.length; i += 2) {
    const next = (i + 2) % polygon.length;

    area += polygon[i] * polygon[next + 1] - polygon[next] * polygon[i + 1];
  }

  return area / 2;
}

describe('mask boundaries', () => {
  it('reconstructs every 3 by 3 mask with holes, narrow joins and diagonal contacts', () => {
    for (let bits = 0; bits < 512; bits++) {
      const pixels = Uint8Array.from({ length: 9 }, (_, i) => (bits >> i) & 1);
      const polygons = maskPolygons(pixels, 3, 3);

      expect(polygonMask(polygons), `mask ${bits}`).toEqual(pixels);
      expect(decodeMask(encodeMask(pixels, 3, 3))).toEqual(pixels);
      expect(polygons.every((ring) => ring.length >= 8 && ring.length % 2 === 0)).toBe(true);
    }
  });

  it('preserves pixel coverage and oriented area across seeded rectangular masks', () => {
    let state = 5719;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

      return state / 2 ** 32;
    };

    for (let sample = 0; sample < 240; sample++) {
      const width = 1 + Math.floor(random() * 24);
      const height = 1 + Math.floor(random() * 24);
      const occupiedShare = random();
      const pixels = Uint8Array.from({ length: width * height }, () => (random() < occupiedShare ? 255 : 0));
      const before = pixels.slice();
      const polygons = maskPolygons(pixels, width, height);

      expect(polygonMask(polygons, width, height)).toEqual(pixels.map((v) => Number(v !== 0)));
      expect(polygons.reduce((area, ring) => area + signedArea(ring), 0)).toBe(
        pixels.reduce((count, v) => count + Number(v !== 0), 0),
      );
      expect(pixels).toEqual(before);
    }
  });

  it('retains ring order, corner order and hole winding', () => {
    expect(maskPolygons(new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]), 3, 3)).toEqual([
      [0, 0, 3, 0, 3, 3, 0, 3],
      [2, 1, 1, 1, 1, 2, 2, 2],
    ]);
    expect(maskPolygons(new Uint8Array([1, 0, 0, 1]), 2, 2)).toEqual([
      [0, 0, 1, 0, 1, 1, 0, 1],
      [1, 1, 2, 1, 2, 2, 1, 2],
    ]);
  });

  it('reads edited mask views and returns independent rings', () => {
    const buffer = new Uint8Array([77, 1, 1, 1, 1, 88]);
    const pixels = buffer.subarray(1, 5);
    const first = maskPolygons(pixels, 2, 2);

    first[0][0] = 200;
    expect(maskPolygons(pixels, 2, 2)).toEqual([[0, 0, 2, 0, 2, 2, 0, 2]]);
    pixels[3] = 0;
    expect(polygonMask(maskPolygons(pixels, 2, 2), 2, 2)).toEqual(pixels);
    expect(buffer).toEqual(new Uint8Array([77, 1, 1, 1, 0, 88]));
    expect(maskPolygons(new Uint8Array(1), 1, 1)).toEqual([]);
  });

  it.each([20, 40])('traces a 30 by %i checkerboard without temporary filter, sort or flatMap results', (height) => {
    const pixels = Uint8Array.from({ length: 30 * height }, (_, i) => Number((i + Math.floor(i / 30)) % 2 === 0));
    const filter = vi.spyOn(Array.prototype, 'filter');
    const sort = vi.spyOn(Array.prototype, 'sort');
    const flatMap = vi.spyOn(Array.prototype, 'flatMap');
    let calls: number[];
    let polygons: number[][];

    try {
      polygons = maskPolygons(pixels, 30, height);
      calls = [filter.mock.calls.length, sort.mock.calls.length, flatMap.mock.calls.length];
    } finally {
      filter.mockRestore();
      sort.mockRestore();
      flatMap.mockRestore();
    }

    expect(calls).toEqual([0, 0, 0]);
    expect(polygons).toHaveLength((30 * height) / 2);
    expect(polygonMask(polygons, 30, height)).toEqual(pixels);
  });

  it('uses inclusive visible pixels for one-pixel and edge-clipped boxes', () => {
    expect(maskBox(new Uint8Array([0, 0, 0, 1]), 2, 2)).toEqual([1, 1, 1, 1]);
    expect(maskBox(new Uint8Array([1, 1, 1, 1]), 2, 2)).toEqual([0, 0, 2, 2]);
  });

  it.each([
    { size: [2, 2], counts: [] },
    { size: [2, 2], counts: [0, 1, 0, 3] },
    { size: [2, 2], counts: [1, -1, 4] },
    { size: [2, 2], counts: [1, 0.5, 2.5] },
    { size: [2, 2], counts: [5] },
    { size: [0, 2], counts: [0] },
  ])('refuses malformed mask runs %o', (mask) => {
    expect(() => decodeMask({ ...mask, size: [mask.size[0], mask.size[1]] })).toThrow();
  });
});
