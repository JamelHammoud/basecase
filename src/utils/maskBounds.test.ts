import { describe, expect, it } from 'vitest';
import { cropMask, type Region } from './outlineTrace';
import { maskBounds, type Mask } from './silhouetteProfile';

const regions: Region[] = [
  { x0: 0, y0: 0, x1: 1, y1: 1 },
  { x0: 0.23, y0: 0.17, x1: 0.81, y1: 0.78 },
  { x0: -0.5, y0: -1, x1: 0.6, y1: 2 },
  { x0: 0.8, y0: 0.2, x1: 0.1, y1: 0.9 },
  { x0: 0.1, y0: 0.8, x1: 0.9, y1: 0.2 },
  { x0: 1.1, y0: 0, x1: 2, y1: 1 },
  { x0: 0.4, y0: 0.4, x1: 0.4, y1: 0.4 },
  { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity },
  { x0: NaN, y0: 0, x1: 1, y1: 1 },
  { x0: 0, y0: 0, x1: 1, y1: NaN },
];

function checkRegions(mask: Mask) {
  const original = mask.data.slice();

  for (const region of regions) {
    expect(
      maskBounds(mask, {
        x0: Math.floor(region.x0 * mask.width),
        x1: Math.ceil(region.x1 * mask.width) - 1,
        y0: Math.floor(region.y0 * mask.height),
        y1: Math.ceil(region.y1 * mask.height) - 1,
      }),
    ).toEqual(maskBounds(cropMask(mask, region)));
  }

  expect(mask.data).toEqual(original);
}

describe('regional mask bounds', () => {
  it('matches cropped measurements across masks, clipped regions, views and source edits', () => {
    for (const [width, height] of [
      [0, 0],
      [1, 19],
      [23, 1],
      [17, 23],
    ]) {
      const storage = new Uint8Array(width * height + 12);
      const data = storage.subarray(5, storage.length - 7);
      const mask = { data, width, height };

      checkRegions(mask);

      for (let i = 0; i < data.length; i++) data[i] = i % 7 === 0 ? 127 : 0;

      checkRegions(mask);
      data.fill(255);
      checkRegions(mask);
    }

    checkRegions({ data: new Uint8Array(43).fill(127), width: 11, height: 9 });
  });

  it('measures inclusive pixel limits and retains full-mask empty bounds', () => {
    const mask = { data: new Uint8Array(120).fill(1), width: 12, height: 10 };

    expect(maskBounds(mask, { x0: 3, x1: 3, y0: 4, y1: 6 })).toEqual({ x0: 3, x1: 3, y0: 4, y1: 6 });
    expect(maskBounds(mask, { x0: 12, x1: 15, y0: 0, y1: 9 })).toEqual({ x0: 12, x1: -1, y0: 10, y1: -1 });
    expect(maskBounds(mask)).toEqual({ x0: 0, x1: 11, y0: 0, y1: 9 });
  });
});
