import { describe, expect, it } from 'vitest';
import { maskRows, rowBandWidths } from './maskRows';
import { bandWidths, maskBounds, maskProfileOf, type Mask, type MaskBox } from './silhouetteProfile';
import { traceOutline } from './outlineTrace';
import { cornerRadii, fitTarget } from './targetFit';
import { seededRandom } from './seededRandom';

function expectedBands(mask: Mask, box: Pick<MaskBox, 'y0' | 'y1'>, bands: number): number[] {
  const height = box.y1 - box.y0 + 1;

  return Array.from({ length: bands }, (_, b) => {
    let widest = 0;

    for (let y = box.y0 + Math.floor((b * height) / bands); y < box.y0 + Math.floor(((b + 1) * height) / bands); y++) {
      const xs = Array.from({ length: mask.width }, (_, x) => x).filter((x) => mask.data[y * mask.width + x]);

      if (xs.length) widest = Math.max(widest, xs[xs.length - 1] - xs[0] + 1);
    }

    return widest;
  });
}

function countedMask(width: number, height: number) {
  let reads = 0;
  const data = new Proxy(new Uint8Array(width * height).fill(255), {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, target);
    },
  });

  return { mask: { data, width, height }, reads: () => reads };
}

describe('shared mask row measurements', () => {
  it('keeps occupied row extents, holes, nonbinary pixels and empty bounds', () => {
    const mask = {
      width: 5,
      height: 4,
      data: new Uint8Array([0, 2, 0, 255, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
    };

    expect(maskRows(mask)).toEqual({
      box: { x0: 0, x1: 4, y0: 0, y1: 3 },
      rows: [
        { y: 0, left: 1, right: 4 },
        { y: 2, left: 0, right: 5 },
        { y: 3, left: 2, right: 3 },
      ],
    });

    for (const [width, height] of [
      [0, 0],
      [0, 4],
      [5, 0],
      [5, 4],
    ]) {
      const empty = { width, height, data: new Uint8Array(width * height) };

      expect(maskRows(empty)).toEqual({ box: maskBounds(empty), rows: [] });
      expect(bandWidths(empty)).toBeNull();
      expect(traceOutline(empty, { mmPerPx: 1 })).toBeNull();
    }
  });

  it('matches direct band measurements across gaps, narrow images and independent vertical ranges', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');

    for (let trial = 0; trial < 120; trial++) {
      const width = 1 + (trial % 23);
      const height = 1 + (trial % 31);
      const mask = { width, height, data: Uint8Array.from({ length: width * height }, () => (random() < 0.3 ? 2 : 0)) };
      const original = mask.data.slice();
      const measured = maskRows(mask);

      expect(measured.box).toEqual(maskBounds(mask));

      for (const bands of [1, 3, 10, 40]) {
        const box = { y0: trial % 5, y1: height - 1 - (trial % 3) };

        expect(rowBandWidths(measured.rows, box, bands)).toEqual(expectedBands(mask, box, bands));

        if (measured.box.x1 < 0) continue;

        const widths = expectedBands(mask, measured.box, bands);
        const h = measured.box.y1 - measured.box.y0 + 1;
        const round = (value: number) => Math.round(value * 1000) / 1000;

        expect(bandWidths(mask, bands)).toEqual({ widths, box: measured.box });
        expect(maskProfileOf(mask, bands)).toEqual({
          bands: widths.map((w) => round(w / h)),
          aspect: round((measured.box.x1 - measured.box.x0 + 1) / h),
        });
      }

      expect(mask.data).toEqual(original);
    }
  });

  it('rebuilds measurements after edits and leaves earlier results independent', () => {
    const mask = { width: 5, height: 4, data: new Uint8Array(20) };

    mask.data[7] = 1;

    const first = maskRows(mask);
    const widths = rowBandWidths(first.rows, first.box, 1);

    mask.data[7] = 0;
    mask.data[19] = 255;

    expect(maskRows(mask)).toEqual({ box: { x0: 4, x1: 4, y0: 3, y1: 3 }, rows: [{ y: 3, left: 4, right: 5 }] });
    expect(first).toEqual({ box: { x0: 2, x1: 2, y0: 1, y1: 1 }, rows: [{ y: 1, left: 2, right: 3 }] });
    expect(widths).toEqual([1]);
  });

  it.each([300, 600])('reads each pixel once for every row-measurement consumer at %i rows', (height) => {
    const consumers = [
      (mask: Mask) => bandWidths(mask),
      (mask: Mask) => maskProfileOf(mask),
      (mask: Mask) => traceOutline(mask, { mmPerPx: 0.5, n: 24 }),
    ];

    for (const consume of consumers) {
      const input = countedMask(40, height);

      expect(consume(input.mask)).not.toBeNull();
      expect(input.reads()).toBe(40 * height);
    }
  });

  it('measures both fitted outlines over the target range and keeps their corner radii', () => {
    const target: Mask = { width: 12, height: 16, data: new Uint8Array(192) };
    const model: Mask = { width: 16, height: 12, data: new Uint8Array(192) };

    for (let y = 2; y < 14; y++) for (let x = 2; x < 10; x++) target.data[y * target.width + x] = y % 4 === 0 ? 0 : 1;

    for (let y = 1; y < 11; y++) for (let x = 1; x < 15; x++) model.data[y * model.width + x] = x % 3 === 0 ? 0 : 1;

    for (const scale of [0.5, 1, 2]) {
      const fit = fitTarget({ target, model: { mask: model, mmPerPx: scale }, targetMmPerPx: 1 })!;
      const { grid } = fit;
      const a = { width: grid.width, height: grid.height, data: grid.target };
      const b = { ...a, data: grid.model };
      const box = maskBounds(a);
      const targetWidths = expectedBands(a, box, 10);
      const modelWidths = expectedBands(b, box, 10);

      expect(fit.bands).toEqual(
        targetWidths.map((w, band) => ({
          band,
          targetMm: w * grid.cellMm,
          modelMm: modelWidths[band] * grid.cellMm,
        })),
      );
      expect(fit.corners).toEqual({
        target: cornerRadii(grid.target, grid.width, grid.cellMm),
        model: cornerRadii(grid.model, grid.width, grid.cellMm),
      });
    }
  });
});
