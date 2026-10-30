import { describe, expect, it } from 'vitest';
import { normalizeSvg, targetText } from './targetCompare.mjs';

describe('sketch targets', () => {
  it('sizes an SVG for rasterizing and keeps its mm height', () => {
    const { svg, heightMm } = normalizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="187mm" height="176mm"><rect width="187" height="176" rx="80"/></svg>',
    );

    expect(heightMm).toBe(176);
    expect(svg).toMatch(/ width="900" height="847"/);
    expect(svg).toMatch(/viewBox="0 0 187 176"/);
  });

  it('has no mm size when the SVG is in pixels', () => {
    expect(normalizeSvg('<svg viewBox="0 0 400 300"><circle r="10"/></svg>').heightMm).toBeNull();
  });

  it('says how the model misses the outline, in mm', () => {
    const text = targetText('your outline', 'front', {
      iou: 0.76,
      scaledToHeight: true,
      targetSize: [187, 176],
      modelSize: [160, 176],
      bands: [
        { band: 0, targetMm: 120, modelMm: 150 },
        { band: 5, targetMm: 187, modelMm: 160 },
      ],
      gapMeanMm: 6.2,
      gapMaxMm: 18,
      corners: { target: { top: 80, bottom: 80 }, model: { top: 25, bottom: 20 } },
    });

    expect(text).toContain('Overlap (IoU) 0.76');
    expect(text).toContain('corners tighter than yours');
    expect(text).toContain('50–60%: 187 → 160 mm (−27)  ← model narrower');
  });
});
