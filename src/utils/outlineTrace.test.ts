import { describe, expect, it } from 'vitest';
import { cropMask, traceOutline } from './outlineTrace';
import type { Mask } from './silhouetteProfile';

function photo(): Mask {
  const width = 300,
    height = 400;
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const head = (x - 150) ** 2 + (y - 80) ** 2 <= 60 ** 2;
      const body = Math.abs(x - 150) <= 90 && y >= 150 && y <= 380;

      data[y * width + x] = head || body ? 1 : 0;
    }

  return { data, width, height };
}

describe('outline tracing', () => {
  it('keeps contour winding, caps, scale and offset for a single occupied row', () => {
    const mask = { width: 3, height: 3, data: new Uint8Array([0, 0, 0, 0, 255, 0, 0, 0, 0]) };

    expect(traceOutline(mask, { mmPerPx: 2, n: 8, z0: -3 })).toEqual({
      points: [
        [1, -2],
        [1, -3],
        [0, -3],
        [-1, -3],
        [-1, -2],
        [-1, -1],
        [0, -1],
        [1, -1],
      ],
      widthMm: 2,
      heightMm: 2,
      bandsMm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    });
  });

  it('groups occupied rows into width bands across gaps without changing the source', () => {
    const data = new Uint8Array(12 * 30);

    for (let row = 0; row < 11; row++) data.fill(2, row * 24 + 1, row * 24 + row + 2);

    const before = data.slice();
    const mask = { width: 12, height: 30, data };
    const traced = traceOutline(mask, { mmPerPx: 0.5, n: 32 })!;

    expect(traced.bandsMm).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5]);
    expect(traced.widthMm).toBe(5.5);
    expect(traced.heightMm).toBe(10.5);
    expect(traced.points).toHaveLength(32);
    expect(data).toEqual(before);

    data.fill(0);

    expect(traceOutline(mask, { mmPerPx: 0.5 })).toBeNull();
    expect(traced.bandsMm).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5]);
  });

  it('traces a round head from a region of the photo, in mm', () => {
    const head = cropMask(photo(), { x0: 0, y0: 0, x1: 1, y1: 0.35 });
    const traced = traceOutline(head, { mmPerPx: 0.5, n: 24, z0: 300 })!;

    expect(traced.points).toHaveLength(24);
    expect(Math.abs(traced.widthMm - 60)).toBeLessThan(1.5);
    expect(Math.abs(traced.heightMm - 60)).toBeLessThan(1.5);

    for (const [x, z] of traced.points) expect(Math.abs(Math.hypot(x, z - 330) - 30)).toBeLessThan(2);

    expect(traced.bandsMm[5]).toBeGreaterThan(traced.bandsMm[0]);
  });
});
