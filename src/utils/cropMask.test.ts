import { describe, expect, it } from 'vitest';
import { cropMask, type Region } from './outlineTrace';
import type { Mask } from './silhouetteProfile';

function pixelCrop(mask: Mask, region: Region): Mask {
  const data = new Uint8Array(mask.data.length);

  for (
    let y = Math.max(0, Math.floor(region.y0 * mask.height));
    y < Math.min(mask.height, Math.ceil(region.y1 * mask.height));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(region.x0 * mask.width));
      x < Math.min(mask.width, Math.ceil(region.x1 * mask.width));
      x++
    )
      data[y * mask.width + x] = mask.data[y * mask.width + x];

  return { ...mask, data };
}

const regions: Region[] = [
  { x0: 0, y0: 0, x1: 1, y1: 1 },
  { x0: 0.23, y0: 0.14, x1: 0.78, y1: 0.81 },
  { x0: -1, y0: -1, x1: 2, y1: 2 },
  { x0: 2, y0: 0, x1: 3, y1: 1 },
  { x0: 0, y0: 2, x1: 1, y1: 3 },
  { x0: 0.8, y0: 0.7, x1: 0.2, y1: 0.1 },
  { x0: 0, y0: 0, x1: 0, y1: 1 },
  { x0: NaN, y0: 0, x1: 1, y1: 1 },
  { x0: 0, y0: NaN, x1: 1, y1: 1 },
  { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity },
  ...Array.from({ length: 80 }, (_, i) => ({
    x0: ((i * 17) % 101) / 50 - 0.5,
    y0: ((i * 29) % 103) / 50 - 0.5,
    x1: ((i * 37) % 107) / 50,
    y1: ((i * 43) % 109) / 50,
  })),
];

describe('photo region copies', () => {
  it('matches pixel crops across fractional bounds, clipping, empty regions and buffer views', () => {
    for (const [width, height] of [
      [0, 0],
      [1, 13],
      [17, 1],
      [19, 23],
      [31, 43],
    ]) {
      const source = Uint8Array.from({ length: width * height + 16 }, (_, i) => (i * 37) % 256);
      const mask = { width, height, data: source.subarray(8, source.length - 8) };
      const original = source.slice();

      for (const region of regions) {
        const result = cropMask(mask, region);

        expect(result).toEqual(pixelCrop(mask, region));
        expect(result.data.buffer).not.toBe(source.buffer);
      }

      expect(source).toEqual(original);
      expect(cropMask(mask)).toBe(mask);
    }
  });

  it('keeps independent results after source edits and tolerates incomplete buffers', () => {
    const mask = { width: 11, height: 9, data: new Uint8Array(43).fill(127) };
    const region = { x0: 0.2, y0: 0.1, x1: 0.9, y1: 0.9 };
    const first = cropMask(mask, region);
    const expected = pixelCrop(mask, region);

    mask.data.fill(255);

    expect(first).toEqual(expected);
    expect(cropMask(mask, region)).toEqual(pixelCrop(mask, region));
  });
});
