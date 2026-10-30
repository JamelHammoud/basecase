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
