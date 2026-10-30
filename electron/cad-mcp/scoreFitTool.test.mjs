import { describe, expect, it } from 'vitest';
import { fitScore } from './scoreFitTool.mjs';

const photo = { bands: [0.2, 0.25, 0.4, 0.42, 0.4, 0.3, 0.2, 0.2, 0.2, 0.22], aspect: 0.42 };

describe('block-out scoring', () => {
  it('ranks the block-out with the right proportions first', () => {
    const close = { bands: photo.bands.map((b) => b * 1.05), aspect: 0.44 };
    const boxy = { bands: photo.bands.map(() => 0.42), aspect: 0.42 };

    expect(fitScore({ reference: photo, model: close }).score).toBeGreaterThan(90);
    expect(fitScore({ reference: photo, model: boxy }).score).toBeLessThan(70);
  });

  it('leaves out bands where the photo is posed differently', () => {
    const armsOut = { ...photo, bands: photo.bands.map((b, i) => (i === 4 ? 0.9 : b)) };

    expect(fitScore({ reference: armsOut, model: photo }, [4]).score).toBe(100);
    expect(fitScore({ reference: armsOut, model: photo }).within).toBe(9);
  });
});
