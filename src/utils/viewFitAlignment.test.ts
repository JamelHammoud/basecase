import { describe, expect, it } from 'vitest';
import { maskArea, type Mask } from './silhouetteProfile';
import { alignModel, fitDetail, moments, placeModel, type Alignment } from './viewFit';

const ROLLS = [-8, -6, -4, -2, 0, 2, 4, 6, 8];

function referencePlacement(photo: Mask, model: Mask, align: Omit<Alignment, 'iou'>) {
  const p = moments(photo);
  const m = moments(model);
  const out = new Uint8Array(photo.width * photo.height);
  const angle = (align.roll * Math.PI) / 180;

  for (let y = 0; y < photo.height; y++)
    for (let x = 0; x < photo.width; x++) {
      const u = (x - p.cx - align.dx) / align.scale;
      const v = (y - p.cy - align.dy) / align.scale;
      const mx = Math.round(m.cx + Math.cos(angle) * u + Math.sin(angle) * v);
      const my = Math.round(m.cy - Math.sin(angle) * u + Math.cos(angle) * v);

      if (mx >= 0 && my >= 0 && mx < model.width && my < model.height) {
        out[y * photo.width + x] = model.data[my * model.width + mx];
      }
    }

  return out;
}

function referenceAlignment(photo: Mask, model: Mask, rolls = [0]): Alignment {
  const scale = Math.sqrt(maskArea(photo) / Math.max(1, maskArea(model)));
  let best: Alignment = { iou: -1, roll: 0, scale, dx: 0, dy: 0 };

  for (const roll of rolls)
    for (const factor of [0.96, 1, 1.04]) {
      const candidate = { roll, scale: scale * factor, dx: 0, dy: 0 };
      const placed = referencePlacement(photo, model, candidate);
      let both = 0;
      let any = 0;

      for (let i = 0; i < placed.length; i++) {
        both += photo.data[i] & placed[i];
        any += photo.data[i] | placed[i];
      }

      const iou = any ? both / any : 0;

      if (iou > best.iou) best = { ...candidate, iou };
    }

  return best;
}

function mask(width: number, height: number, seed: number): Mask {
  const data = new Uint8Array(width * height);
  let state = seed;

  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = state % 7 < 3 ? 1 : 0;
  }

  return { data, width, height };
}

function countedMask(source: Mask) {
  let reads = 0;
  const data = new Proxy(source.data, {
    get(target, property) {
      if (property === Symbol.iterator) return Array.prototype.values.bind(data);

      if (typeof property === 'string' && /^\d+$/.test(property)) reads++;

      const value: unknown = Reflect.get(target, property, target);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return { mask: { ...source, data }, reads: () => reads };
}

describe('camera alignment preparation', () => {
  it.each([
    [3, 3, 1],
    [64, 48, 2],
  ])('stops after a perfect fit at %i by %i after %i candidates', (width, height, candidates) => {
    const source = mask(width, height, 71);
    const photo = countedMask(source);
    const before = source.data.slice();
    const rolls = [0, ...ROLLS];
    const actual = alignModel(photo.mask, source, rolls);

    expect(actual).toEqual(referenceAlignment(source, source, rolls));
    expect(actual.iou).toBe(1);
    expect(photo.reads()).toBe(source.data.length * (1 + 2 * candidates));
    expect(source.data).toEqual(before);
  });

  it('matches fresh raster scoring across dimensions, rotations and source edits', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const photo = mask(9 + (seed % 13), 8 + (seed % 17), seed);
      const model = mask(7 + (seed % 19), 11 + (seed % 11), seed + 80);
      const before = { photo: photo.data.slice(), model: model.data.slice() };
      const rolls = seed % 2 ? ROLLS : [31, -20, 0, 90];
      const actual = alignModel(photo, model, rolls);

      expect(actual).toEqual(referenceAlignment(photo, model, rolls));
      expect(placeModel(photo, model, actual)).toEqual(referencePlacement(photo, model, actual));
      expect(fitDetail(photo, model, actual).iou).toBe(actual.iou);
      expect(photo.data).toEqual(before.photo);
      expect(model.data).toEqual(before.model);
      photo.data.fill(0, 0, Math.floor(photo.data.length / 2));
      model.data.fill(1, 0, Math.floor(model.data.length / 3));
      expect(alignModel(photo, model, rolls)).toEqual(referenceAlignment(photo, model, rolls));
    }
  });

  it('preserves default rolls, no candidates, empty masks and first-candidate ties', () => {
    const empty: Mask = { data: new Uint8Array(80), width: 10, height: 8 };
    const full: Mask = { ...empty, data: new Uint8Array(80).fill(1) };

    for (const photo of [empty, full])
      for (const model of [empty, full]) {
        expect(alignModel(photo, model)).toEqual(referenceAlignment(photo, model));
        expect(alignModel(photo, model, [])).toEqual(referenceAlignment(photo, model, []));
        expect(alignModel(photo, model, [4, -4, 4])).toEqual(referenceAlignment(photo, model, [4, -4, 4]));
      }

    expect(alignModel(empty, empty, [8, 0, -8])).toEqual({ iou: 0, roll: 8, scale: 0, dx: 0, dy: 0 });
  });

  it('keeps standalone placements and detail grids owned by each result', () => {
    const photo = mask(23, 19, 71);
    const model = mask(17, 25, 99);
    const alignment = { roll: 20, scale: 1.4, dx: -3, dy: 2 };
    const placed = placeModel(photo, model, alignment);
    const saved = placed.slice();
    const detail = fitDetail(photo, model, { ...alignment, iou: 0 });
    const grid = detail.grid.model.slice();

    expect(placed).toEqual(referencePlacement(photo, model, alignment));
    expect(detail.grid.model).not.toBe(placed);
    alignModel(photo, model, ROLLS);
    placeModel(photo, model, { ...alignment, roll: -30 });
    expect(placed).toEqual(saved);
    expect(detail.grid.model).toEqual(grid);
  });

  it.each([64, 128])('scans each empty %i-pixel-wide mask once for all 27 candidates', (width) => {
    const height = (width * 3) / 4;
    const pixels = width * height;
    const empty = { data: new Uint8Array(pixels), width, height };
    const photo = countedMask(empty);
    const model = countedMask(empty);
    const oldPhoto = countedMask(empty);
    const oldModel = countedMask(empty);

    expect(alignModel(photo.mask, model.mask, ROLLS)).toEqual({ iou: 0, roll: -8, scale: 0, dx: 0, dy: 0 });
    expect(referenceAlignment(oldPhoto.mask, oldModel.mask, ROLLS)).toEqual(alignModel(empty, empty, ROLLS));
    expect(model.reads()).toBe(pixels);
    expect(photo.reads()).toBe(pixels * (1 + 2 * 27));
    expect(oldModel.reads()).toBe(pixels * 28);
    expect(oldPhoto.reads()).toBe(pixels * 82);
  });

  it('removes the same repeated scans from occupied masks', () => {
    const sourcePhoto = mask(24, 18, 78);
    const sourceModel = mask(19, 27, 55);
    const photo = countedMask(sourcePhoto);
    const model = countedMask(sourceModel);
    const oldPhoto = countedMask(sourcePhoto);
    const oldModel = countedMask(sourceModel);

    expect(alignModel(photo.mask, model.mask, ROLLS)).toEqual(referenceAlignment(oldPhoto.mask, oldModel.mask, ROLLS));
    expect(oldPhoto.reads() - photo.reads()).toBe(sourcePhoto.data.length * 27);
    expect(oldModel.reads() - model.reads()).toBe(sourceModel.data.length * 27);
  });
});
