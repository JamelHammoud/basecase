import { describe, expect, it } from 'vitest';
import { scaleFromPart } from './photoScale';

describe('photo scale from a known part', () => {
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
