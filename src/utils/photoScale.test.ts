import { describe, expect, it } from 'vitest';
import { scaleFromPart } from './photoScale';

describe('photo scale from a known part', () => {
  it.each(['width', 'height'] as const)('tightens the selected %s and keeps the whole-subject scale', (axis) => {
    const data = new Uint8Array(120);

    for (let y = 2; y < 8; y++) for (let x = 3; x < 9; x++) data[y * 12 + x] = 127;

    const mask = { data, width: 12, height: 10 };
    const options = { region: { x0: 0.2, x1: 0.8, y0: 0.1, y1: 0.9 }, axis, sizeMm: 30 };

    expect(scaleFromPart(mask, options)).toEqual({ mmPerPx: 5, partPx: 6, tightened: true, subjectMm: [30, 30] });
    data.fill(0);

    expect(scaleFromPart(mask, options)).toBeNull();
  });

  it('keeps box fallback and height tightening for clipped and empty regions', () => {
    const data = new Uint8Array(120);

    for (let y = 2; y < 8; y++) for (let x = 4; x < 8; x++) data[y * 12 + x] = 127;

    const mask = { data, width: 12, height: 10 };

    expect(scaleFromPart(mask, { region: { x0: -1, y0: -1, x1: 2, y1: 2 }, axis: 'height', sizeMm: 30 })).toEqual({
      mmPerPx: 5,
      partPx: 6,
      tightened: true,
      subjectMm: [20, 30],
    });
    expect(scaleFromPart(mask, { region: { x0: 0, y0: 0, x1: 0.25, y1: 1 }, axis: 'width', sizeMm: 30 })).toEqual({
      mmPerPx: 10,
      partPx: 3,
      tightened: false,
      subjectMm: [40, 60],
    });
    expect(scaleFromPart(mask, { region: { x0: 1, y0: 0, x1: 0, y1: 1 }, axis: 'width', sizeMm: 30 })).toBeNull();
    data.fill(0);
    expect(scaleFromPart(mask, { region: { x0: 0, y0: 0, x1: 1, y1: 1 }, axis: 'width', sizeMm: 30 })).toBeNull();
  });

  it('sizes the whole robot from a servo of known width', () => {
    const width = 400,
      height = 600;
    const data = new Uint8Array(width * height);

    for (let y = 100; y < 500; y++) for (let x = 150; x < 250; x++) data[y * width + x] = 1;

    for (let y = 300; y < 320; y++) for (let x = 120; x < 280; x++) data[y * width + x] = 1;

    const scale = scaleFromPart(
      { data, width, height },
      { region: { x0: 0.28, y0: 0.49, x1: 0.72, y1: 0.55 }, axis: 'width', sizeMm: 40 },
    )!;

    expect(scale.tightened).toBe(true);
    expect(scale.partPx).toBe(160);
    expect(scale.mmPerPx).toBeCloseTo(0.25, 3);
    expect(scale.subjectMm).toEqual([40, 100]);
  });
});
