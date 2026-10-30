import { describe, expect, it } from 'vitest';
import type { Mask } from './silhouetteProfile';
import { alignModel, fitDetail } from './viewFit';

function figure({ size, scale, roll, at }: { size: number; scale: number; roll: number; at: [number, number] }): Mask {
  const data = new Uint8Array(size * size);
  const c = Math.cos((roll * Math.PI) / 180),
    s = Math.sin((roll * Math.PI) / 180);

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x - at[0]) / scale,
        dy = (y - at[1]) / scale;
      const u = c * dx + s * dy,
        v = -s * dx + c * dy;
      const head = u * u + (v + 60) ** 2 <= 15 ** 2;
      const body = Math.abs(u) <= 25 && v >= -45 && v <= 20;
      const legs = v > 20 && v <= 70 && Math.abs(Math.abs(u) - 12) <= 6;

      data[y * size + x] = head || body || legs ? 1 : 0;
    }

  return { data, width: size, height: size };
}

describe('camera fit alignment', () => {
  it('recovers scale, offset and roll between a photo and a render', () => {
    const photo = figure({ size: 320, scale: 1.6, roll: 6, at: [150, 170] });
    const render = figure({ size: 240, scale: 1, roll: 0, at: [120, 110] });
    const align = alignModel(photo, render, [-8, -6, -4, -2, 0, 2, 4, 6, 8]);

    expect(Math.abs(align.roll)).toBe(6);
    expect(align.scale).toBeCloseTo(1.6, 1);
    expect(align.iou).toBeGreaterThan(0.9);

    const detail = fitDetail(photo, render, align);

    expect(detail.contourPx).toBeLessThan(2);
    expect(detail.photo!.aspect).toBeCloseTo(detail.model!.aspect, 1);
  });
});
