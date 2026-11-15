import { describe, expect, it } from 'vitest';
import { analyzePixels } from './imagePixelAnalysis';
import { floodMaskOf } from './silhouette';

function image(width: number, height: number, subject: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = subject(x, y) ? 0 : 255;

      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }

  return { data, width, height, colorSpace: 'srgb' };
}

describe('image flood analysis', () => {
  it('keeps enclosed background in the silhouette while leaving an open channel outside', () => {
    const photo = image(40, 30, (x, y) => x >= 8 && x <= 31 && y >= 6 && y <= 23 && !(x >= 16 && x <= 23 && y >= 12));
    const mask = floodMaskOf(photo).mask!;

    expect(mask.data).toEqual(Uint8Array.from({ length: 1200 }, (_, i) => (photo.data[i * 4] === 0 ? 1 : 0)));

    const closed = image(
      40,
      30,
      (x, y) => x >= 8 && x <= 31 && y >= 6 && y <= 23 && !(x >= 16 && x <= 23 && y >= 12 && y <= 17),
    );
    const filled = floodMaskOf(closed).mask!;

    expect(filled.data).toEqual(
      Uint8Array.from({ length: 1200 }, (_, i) => {
        const x = i % 40;
        const y = Math.floor(i / 40);

        return x >= 8 && x <= 31 && y >= 6 && y <= 23 ? 1 : 0;
      }),
    );
  });

  it('measures two enclosed holes while excluding background connected to the border', () => {
    const photo = image(40, 40, (x, y) => {
      const body = x >= 5 && x <= 34 && y >= 5 && y <= 34;
      const hole = (x >= 10 && x <= 13 && y >= 10 && y <= 13) || (x >= 24 && x <= 27 && y >= 24 && y <= 27);
      const notch = x >= 18 && x <= 20 && y <= 15;

      return body && !hole && !notch;
    });
    const result = analyzePixels({
      data: photo.data,
      gridSize: 40,
      imageWidth: 400,
      imageHeight: 400,
      targetSpanMm: 70,
      extrudeHeightMm: 10,
    });

    expect(result.detectedHoleCenters).toEqual([
      { xNorm: -0.276, zNorm: 0.276, radiusNorm: 0.078 },
      { xNorm: 0.207, zNorm: -0.207, radiusNorm: 0.078 },
    ]);
    expect(result.contour.holes).toHaveLength(2);
    expect(result.dominantColor).toBe('#000000');
    expect(result.suggestedDimensions).toEqual({ width: 70, height: 10, depth: 70, thickness: 4 });
  });
});
