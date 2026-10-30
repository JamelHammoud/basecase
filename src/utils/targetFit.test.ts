import { describe, expect, it } from 'vitest';
import type { Mask } from './silhouetteProfile';
import { fitTarget } from './targetFit';

function roundedRect({ w, h, r, scale }: { w: number; h: number; r: number; scale: number }): Mask {
  const width = Math.round((w + 40) * scale);
  const height = Math.round((h + 40) * scale);
  const data = new Uint8Array(width * height);

  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const x = px / scale - 20,
        y = py / scale - 20;
      const qx = Math.min(Math.max(x, r), w - r),
        qy = Math.min(Math.max(y, r), h - r);
      const inside = x >= 0 && x <= w && y >= 0 && y <= h && (x - qx) ** 2 + (y - qy) ** 2 <= r * r;

      data[py * width + px] = inside ? 1 : 0;
    }

  return { data, width, height };
}

describe('target outlines', () => {
  it('measures how far a boxy head is from a rounder sketch', () => {
    const sketch = roundedRect({ w: 187, h: 176, r: 80, scale: 2 });
    const model = roundedRect({ w: 160, h: 176, r: 20, scale: 1.5 });
    const fit = fitTarget({ target: sketch, model: { mask: model, mmPerPx: 1 / 1.5 } })!;

    expect(fit.scaledToHeight).toBe(true);
    expect(fit.targetSize[0]).toBeCloseTo(187, -1);
    expect(fit.modelSize[0]).toBeCloseTo(160, -1);
    expect(fit.iou).toBeGreaterThan(0.75);
    expect(fit.iou).toBeLessThan(0.95);
    expect(fit.corners.target.top).toBeGreaterThan(60);
    expect(fit.corners.model.top).toBeLessThan(30);
    expect(fit.gapMaxMm).toBeGreaterThan(10);
  });

  it('scores a matching outline near 1 at true scale', () => {
    const sketch = roundedRect({ w: 120, h: 80, r: 30, scale: 3 });
    const model = roundedRect({ w: 120, h: 80, r: 30, scale: 2 });
    const fit = fitTarget({ target: sketch, model: { mask: model, mmPerPx: 0.5 }, targetMmPerPx: 1 / 3 })!;

    expect(fit.scaledToHeight).toBe(false);
    expect(fit.iou).toBeGreaterThan(0.95);
    expect(fit.gapMeanMm).toBeLessThan(1.5);
    expect(fit.bands.every((b) => Math.abs(b.modelMm - b.targetMm) < 3)).toBe(true);
  });
});
