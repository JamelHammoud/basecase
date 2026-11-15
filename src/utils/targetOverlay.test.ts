import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from './seededRandom';
import { fitTarget, overlayPixels, type Grid } from './targetFit';
import { fitDetail } from './viewFit';

class PixelImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

function previousOverlay(grid: Grid, scale: number) {
  const width = grid.width * scale;
  const height = grid.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = Math.floor(y / scale) * grid.width + Math.floor(x / scale);
      const target = grid.target[i];
      const model = grid.model[i];
      let rgb = [24, 24, 24];

      if (target && model) rgb = [150, 150, 150];
      else if (target) rgb = [235, 64, 52];
      else if (model) rgb = [13, 153, 255];

      data.set([...rgb, 255], (y * width + x) * 4);
    }

  return { data, width, height };
}

function gridOf(width: number, height: number): Grid {
  const random = seededRandom('123456789abcdef0123456789abcdef0');
  const mask = () => Uint8Array.from({ length: width * height }, () => Math.floor(random() * 4));

  return { width, height, cellMm: 0.5, target: mask(), model: mask() };
}

function expectPreviousOverlay(grid: Grid, scale = 3) {
  const actual = overlayPixels(grid, scale);
  const expected = previousOverlay(grid, scale);

  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(Buffer.from(actual.data).equals(Buffer.from(expected.data))).toBe(true);
}

beforeEach(() => {
  vi.stubGlobal('ImageData', PixelImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('comparison overlay pixels', () => {
  it('draws background, model, target and overlap with opaque colors', () => {
    const grid = {
      width: 4,
      height: 1,
      cellMm: 1,
      target: Uint8Array.of(0, 0, 1, 2),
      model: Uint8Array.of(0, 3, 0, 1),
    };

    expect([...overlayPixels(grid, 1).data]).toEqual([
      24, 24, 24, 255, 13, 153, 255, 255, 235, 64, 52, 255, 150, 150, 150, 255,
    ]);
  });

  it.each([0.5, 1, 1.5, 2, 3, 4])('matches every previous output byte at scale %s', (scale) => {
    for (const [width, height] of [
      [8, 6],
      [2, 12],
      [14, 2],
    ]) {
      const grid = gridOf(width, height);
      const before = { target: grid.target.slice(), model: grid.model.slice() };
      const actual = overlayPixels(grid, scale);

      expect(actual).toEqual(previousOverlay(grid, scale));
      expect(grid.target).toEqual(before.target);
      expect(grid.model).toEqual(before.model);
    }
  });

  it('reads edited masks afresh and keeps earlier results independent', () => {
    const grid = gridOf(8, 6);
    const first = overlayPixels(grid);
    const before = first.data.slice();

    grid.target.fill(0);
    grid.model.fill(0);

    const next = overlayPixels(grid);

    expect(next).toEqual(previousOverlay(grid, 3));
    expect(next.data).not.toEqual(before);
    expect(first.data).toEqual(before);

    next.data.fill(0);

    expect(overlayPixels(grid)).toEqual(previousOverlay(grid, 3));
    expect(first.data).toEqual(before);
  });

  it('preserves the overlays produced by sketch-target and camera-fit comparisons', () => {
    const grid = gridOf(8, 6);
    const target = { width: grid.width, height: grid.height, data: grid.target };
    const model = { ...target, data: grid.model };
    const fit = fitTarget({ target, model: { mask: model, mmPerPx: 1 }, targetMmPerPx: 1 })!;
    const detail = fitDetail(target, model, { iou: 0, roll: 6, scale: 0.8, dx: 1, dy: -1 });

    expectPreviousOverlay(fit.grid);
    expectPreviousOverlay(detail.grid, 1);
  });

  it.each([
    [20, 15],
    [30, 20],
  ])('reuses four color arrays across %s by %s masks and repeated renders', (width, height) => {
    const grid = gridOf(width, height);
    const set = vi.spyOn(Uint8ClampedArray.prototype, 'set');
    const colors = new Set<ArrayLike<number>>();

    for (const scale of [1, 3]) {
      const expected = previousOverlay(grid, scale);

      set.mockClear();

      const actual = overlayPixels(grid, scale);

      for (const [color] of set.mock.calls) colors.add(color);

      expect(set).toHaveBeenCalledTimes(width * height * scale * scale);
      expect(colors.size).toBe(4);
      expect(actual).toEqual(expected);
    }
  });
});
