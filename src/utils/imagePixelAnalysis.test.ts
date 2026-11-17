import { describe, expect, it, vi } from 'vitest';
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

describe('image hole bounds', () => {
  it.each(['empty', 'point', 'row', 'column', 'two rows', 'two columns'])(
    'skips background traversal for %s foreground without an interior',
    (shape) => {
      const subjects: Record<string, (x: number, y: number) => boolean> = {
        empty: () => false,
        point: (x, y) => x === 20 && y === 20,
        row: (x, y) => x >= 5 && x <= 34 && y === 20,
        column: (x, y) => y >= 5 && y <= 34 && x === 20,
        'two rows': (x, y) => x >= 5 && x <= 34 && (y === 20 || y === 21),
        'two columns': (x, y) => y >= 5 && y <= 34 && (x === 20 || x === 21),
      };
      const photo = image(40, 40, subjects[shape]);
      const before = photo.data.slice();
      const pop = vi.spyOn(Array.prototype, 'pop');
      let pops: number;
      let result;

      try {
        result = analyzePixels({
          data: photo.data,
          gridSize: 40,
          imageWidth: 400,
          imageHeight: 400,
          targetSpanMm: 70,
          extrudeHeightMm: 10,
        });
        pops = pop.mock.calls.length;
      } finally {
        pop.mockRestore();
      }

      expect(result.detectedHoleCenters).toEqual([]);
      expect(result.contour.holes).toEqual([]);
      expect(photo.data).toEqual(before);
      expect(pops).toBe(0);
    },
  );

  it('keeps the smallest accepted enclosed hole', () => {
    const photo = image(
      12,
      12,
      (x, y) => x >= 4 && x <= 7 && y >= 4 && y <= 7 && (x === 4 || x === 7 || y === 4 || y === 7),
    );
    const result = analyzePixels({
      data: photo.data,
      gridSize: 12,
      imageWidth: 120,
      imageHeight: 120,
      targetSpanMm: 70,
      extrudeHeightMm: 10,
    });

    expect(result.detectedHoleCenters).toHaveLength(1);
    expect(result.detectedHoleCenters[0].radiusNorm).toBeCloseTo(0.094, 10);
    expect(result.contour.holes).toHaveLength(1);
  });
});

describe('image flood analysis', () => {
  it.each([
    { color: [138, 100, 100, 255], backgroundAlpha: 255, expected: '#d4d4d8' },
    { color: [138, 101, 100, 255], backgroundAlpha: 255, expected: '#8a6564' },
    { color: [138, 101, 100, 90], backgroundAlpha: 255, expected: '#d4d4d8' },
    { color: [138, 101, 100, 91], backgroundAlpha: 255, expected: '#8a6564' },
    { color: [100, 100, 100, 91], backgroundAlpha: 0, expected: '#646464' },
    { color: [100, 100, 100, 90], backgroundAlpha: 0, expected: '#d4d4d8' },
  ])('keeps color and alpha cutoffs for $color on alpha $backgroundAlpha', ({ color, backgroundAlpha, expected }) => {
    const photo = image(20, 20, () => false);

    for (let pixel = 0; pixel < 400; pixel++) photo.data.set([100, 100, 100, backgroundAlpha], pixel * 4);

    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) photo.data.set(color, (y * 20 + x) * 4);

    const original = photo.data.slice();
    const result = analyzePixels({
      data: photo.data,
      gridSize: 20,
      imageWidth: 200,
      imageHeight: 200,
      targetSpanMm: 70,
      extrudeHeightMm: 10,
    });

    expect(result.dominantColor).toBe(expected);
    expect(photo.data).toEqual(original);
  });

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
    expect(result.contour.holes).toEqual(
      result.detectedHoleCenters.map(({ xNorm, zNorm, radiusNorm }) =>
        Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2;

          return [
            Math.round((xNorm + Math.cos(angle) * radiusNorm) * 1000) / 1000,
            Math.round((zNorm + Math.sin(angle) * radiusNorm) * 1000) / 1000,
          ];
        }),
      ),
    );
    expect(result.dominantColor).toBe('#000000');
    expect(result.suggestedDimensions).toEqual({ width: 70, height: 10, depth: 70, thickness: 4 });
  });
});
