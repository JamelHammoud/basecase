import { describe, expect, it } from 'vitest';
import { imageStance, resizedDimensions, wrapDegrees } from './partMath';

describe('inspector part math', () => {
  it('wraps angles into (-180, 180]', () => {
    expect([0, 90, 180, 270, -180, 540, -450].map(wrapDegrees)).toEqual([0, 90, 180, -90, 180, 180, -90]);
  });

  it('keeps a reference image at its aspect ratio', () => {
    const dims = { width: 120, height: 80, depth: 1 };

    expect(resizedDimensions(dims, 'width', 60, true)).toEqual({ width: 60, height: 40, depth: 1 });
    expect(resizedDimensions(dims, 'height', 0, true)).toEqual({ width: 1.5, height: 1, depth: 1 });
    expect(resizedDimensions(dims, 'width', 60, false)).toEqual({ width: 60, height: 80, depth: 1 });
    expect(resizedDimensions(dims, 'depth', 5, true)).toEqual({ width: 120, height: 80, depth: 5 });
  });

  it('reads whether an image stands up or lies flat', () => {
    expect(imageStance([0, 45, 0])).toBe('up');
    expect(imageStance([-90, 0, 0])).toBe('flat');
    expect(imageStance([90, 0, 10])).toBe('');
    expect(imageStance([30, 0, 0])).toBe('');
  });
});
