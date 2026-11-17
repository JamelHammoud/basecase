import { describe, expect, it } from 'vitest';
import { maskBox } from '../vision/imageMasks';
import { maskRows } from './maskRows';
import { maskBounds, type Mask, type MaskBox } from './silhouetteProfile';

function reference(mask: Mask, region?: MaskBox) {
  const box = { x0: mask.width, x1: -1, y0: mask.height, y1: -1 };
  const rows: Array<{ y: number; left: number; right: number }> = [];

  for (let y = Math.max(0, region?.y0 ?? 0); y <= Math.min(mask.height - 1, region?.y1 ?? mask.height - 1); y++) {
    let left = -1;
    let right = -1;

    for (let x = Math.max(0, region?.x0 ?? 0); x <= Math.min(mask.width - 1, region?.x1 ?? mask.width - 1); x++) {
      if (!mask.data[y * mask.width + x]) continue;

      left = left < 0 ? x : left;
      right = x + 1;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
    }

    if (left >= 0) rows.push({ y, left, right });
  }

  return { box, rows };
}

describe('mask edge scans', () => {
  it.each([1, 2, 3, 4])('matches full scans for every mask through three rows at width %i', (width) => {
    for (let height = 1; height <= 3; height++) {
      for (let bits = 0; bits < 2 ** (width * height); bits++) {
        const mask = {
          width,
          height,
          data: Uint8Array.from({ length: width * height }, (_, i) => ((bits >> i) & 1) * 255),
        };
        const expected = reference(mask);
        const { x0, y0, x1, y1 } = expected.box;

        expect(maskRows(mask)).toEqual(expected);
        expect(maskBounds(mask)).toEqual(expected.box);
        expect(maskBox(mask.data, width, height)).toEqual(x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
      }
    }
  });

  it.each([
    { width: 6, x0: 0.4, y0: 0.1 },
    { width: 4, x0: 0.2, y0: 0.2 },
  ])('retains forward decimal sampling at $width pixels', ({ width, x0, y0 }) => {
    const mask = { width, height: 2, data: new Uint8Array(width * 2) };
    const region = { x0, x1: width - 1, y0, y1: y0 };

    mask.data[1] = 127;
    mask.data[2] = 255;
    expect(maskBounds(mask, region)).toEqual(reference(mask, region).box);
  });

  it('keeps regional limits, fractional sampling, incomplete views and edited sources', () => {
    const storage = new Uint8Array(90).fill(127);
    const mask = { width: 13, height: 7, data: storage.subarray(3, 78) };
    const regions = [
      { x0: 2, x1: 10, y0: 1, y1: 5 },
      { x0: 2.5, x1: 10, y0: 1.5, y1: 5 },
      { x0: -10, x1: 20, y0: -10, y1: 20 },
      { x0: 12, x1: 12, y0: 0, y1: 6 },
    ];

    for (const fill of [127, 0, 2]) {
      mask.data.fill(fill);
      mask.data[21] = 0;

      const saved = mask.data.slice();

      expect(maskRows(mask)).toEqual(reference(mask));

      for (const region of regions) expect(maskBounds(mask, region)).toEqual(reference(mask, region).box);

      expect(mask.data).toEqual(saved);
    }
  });

  it.each([0, 1, 300])('reads no more than a row scan with %i foreground columns', (occupied) => {
    const width = 300;
    const height = 300;
    const source = Uint8Array.from({ length: width * height }, (_, i) => Number(i % width < occupied));
    let reads = 0;
    const data = new Proxy(source, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });
    const mask = { data, width, height };
    const expectedReads = occupied === width ? 2 * height : width * height;
    const consumers = [() => maskRows(mask), () => maskBounds(mask), () => maskBox(data, width, height)];

    for (const consume of consumers) {
      reads = 0;
      consume();
      expect(reads).toBe(expectedReads);
    }
  });
});
