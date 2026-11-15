import { describe, expect, it } from 'vitest';
import { seededRandom } from './seededRandom';
import { maskBounds, type Mask } from './silhouetteProfile';
import { fitTarget, type Grid } from './targetFit';

function sampled(grid: Grid, mask: Mask, scale: number, shift: [number, number]) {
  const box = maskBounds(mask);
  const width = box.x1 - box.x0 + 1;
  const height = box.y1 - box.y0 + 1;
  const cellWidth = (width * scale) / grid.cellMm;
  const cellHeight = (height * scale) / grid.cellMm;
  const left = Math.round((grid.width - cellWidth) / 2) + shift[0];
  const top = Math.round((grid.height - cellHeight) / 2) + shift[1];
  const out = new Uint8Array(grid.width * grid.height);

  for (let y = top; y < top + Math.ceil(cellHeight); y++)
    for (let x = left; x < left + Math.ceil(cellWidth); x++) {
      const sx = box.x0 + Math.min(width - 1, Math.floor(((x - left + 0.5) * grid.cellMm) / scale));
      const sy = box.y0 + Math.min(height - 1, Math.floor(((y - top + 0.5) * grid.cellMm) / scale));

      out[y * grid.width + x] = mask.data[sy * mask.width + sx];
    }

  return out;
}

function exhaustiveAlignment(grid: Grid, target: Mask, scale: number) {
  let best = { iou: -1, cells: new Uint8Array(0), shift: [0, 0] };

  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const cells = sampled(grid, target, scale, [dx, dy]);
      let intersection = 0;
      let union = 0;

      for (let i = 0; i < cells.length; i++) {
        intersection += cells[i] & grid.model[i];
        union += cells[i] | grid.model[i];
      }

      const iou = union ? intersection / union : 0;

      if (iou > best.iou) best = { iou, cells, shift: [dx, dy] };
    }

  return best;
}

function pattern({ width, height }: { width: number; height: number }): Mask {
  const random = seededRandom('123456789abcdef0123456789abcdef0');
  const data = Uint8Array.from({ length: width * height }, () => (random() < 0.35 ? 1 : 0));

  return { width, height, data };
}

describe('target alignment', () => {
  it.each([
    [31, 23, 1, 1],
    [23, 31, 0.7, 1.3],
    [2, 80, 1.3, 0.7],
    [80, 2, 0.7, 1.3],
    [1, 1, 1, 1],
  ])('matches exhaustive sampling at %s by %s with scales %s and %s', (width, height, targetScale, modelScale) => {
    const target = pattern({ width, height });
    const model = pattern({ width: height, height: width });

    target.data[0] = 1;
    model.data[0] = 1;

    const before = target.data.slice();
    const fit = fitTarget({ target, model: { mask: model, mmPerPx: modelScale }, targetMmPerPx: targetScale })!;
    const expected = exhaustiveAlignment(fit.grid, target, targetScale);

    expect(fit.iou).toBe(expected.iou);
    expect(fit.grid.target).toEqual(expected.cells);
    expect(fit.grid.model).toEqual(sampled(fit.grid, model, modelScale, [0, 0]));
    expect(target.data).toEqual(before);
  });

  it.each([-4, 0, 4].flatMap((x) => [-4, 0, 4].map((y) => [x, y])))('finds offset %s, %s', (dx, dy) => {
    const target = { width: 240, height: 240, data: new Uint8Array(240 * 240) };
    const model = { ...target, data: target.data.slice() };

    for (const mask of [target, model]) {
      mask.data[0] = 1;
      mask.data[mask.data.length - 1] = 1;
    }

    for (let y = 60; y < 140; y++)
      for (let x = 80; x < 120; x++) {
        target.data[y * 240 + x] = 1;
        model.data[(y + dy) * 240 + x + dx] = 1;
      }

    const fit = fitTarget({ target, model: { mask: model, mmPerPx: 1 }, targetMmPerPx: 1 })!;
    const expected = exhaustiveAlignment(fit.grid, target, 1);

    expect(expected.shift).toEqual([dx, dy]);
    expect(fit.iou).toBe(expected.iou);
    expect(fit.grid.target).toEqual(expected.cells);
  });

  it('keeps the first offset on ties and samples the target once', () => {
    const data = new Uint8Array(240 * 240);
    let reads = 0;
    const target: Mask = {
      width: 240,
      height: 240,
      get data() {
        reads++;

        return data;
      },
    };

    data[0] = 1;
    data[data.length - 1] = 1;

    const model = { width: 240, height: 240, data: new Uint8Array(data.length) };

    model.data[100 * 240 + 100] = 1;
    model.data[140 * 240 + 140] = 1;

    const fit = fitTarget({ target, model: { mask: model, mmPerPx: 1 }, targetMmPerPx: 1 })!;

    expect(reads).toBe(1 + 240 * 240);
    expect(fit.iou).toBe(0);
    expect(fit.grid.target).toEqual(sampled(fit.grid, target, 1, [-4, -4]));
  });
});
