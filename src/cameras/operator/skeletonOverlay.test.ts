import { describe, expect, it } from 'vitest';
import type { SkeletonPoint } from './poseProtocol';
import { bonesOf, coverFit } from './skeletonOverlay';

describe('the skeleton overlay', () => {
  it('fits a 16:9 picture into a 4:3 tile the way object-cover crops it', () => {
    const fit = coverFit({ width: 400, height: 300 }, { width: 1600, height: 900 });

    expect(fit.height).toBe(300);
    expect(fit.width).toBeCloseTo(1600 / 3);
    expect(fit.dx).toBeCloseTo(-200 / 3);
    expect(fit.dy).toBe(0);
  });

  it('draws only the bones whose two ends are seen', () => {
    const points: SkeletonPoint[] = Array.from({ length: 33 }, (_, i) => [i / 33, 0.5, i !== 14]);

    expect(bonesOf(points)).toHaveLength(6);
  });
});
