import { describe, expect, it } from 'vitest';
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

function polygonMask(polygons: number[][]): Uint8Array {
  return Uint8Array.from(
    { length: 9 },
    (_, i) => polygons.filter((p) => contains(p, (i % 3) + 0.5, Math.floor(i / 3) + 0.5)).length % 2,
  );
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
