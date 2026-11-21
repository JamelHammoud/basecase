import { describe, expect, it, vi } from 'vitest';
import { floodMaskOf } from './silhouette';

type Color = [number, number, number];

function photo(width: number, height: number, color: (pixel: number) => Color): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel++) data.set([...color(pixel), 255], pixel * 4);

  return { data, width, height, colorSpace: 'srgb' };
}

function fullBorderSpread({ data, width, height }: ImageData): number {
  const border: number[] = [];

  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);

  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);

  const median = [0, 1, 2].map((channel) => {
    const values = border.map((pixel) => data[pixel * 4 + channel]).sort((a, b) => a - b);

    return values[values.length >> 1];
  });

  return (
    border.reduce(
      (total, pixel) =>
        total +
        Math.hypot(data[pixel * 4] - median[0], data[pixel * 4 + 1] - median[1], data[pixel * 4 + 2] - median[2]),
      0,
    ) / border.length
  );
}

describe('photo background colors', () => {
  it.each<Color>([
    [0, 0, 0],
    [255, 255, 255],
    [0, 128, 255],
  ])('separates a subject from the plain background %j', (r, g, b) => {
    const image = photo(9, 7, (pixel) => (pixel === 31 ? [128, 0, 128] : [r, g, b]));
    const original = image.data.slice();

    expect(floodMaskOf(image)).toEqual({
      mask: { width: 9, height: 7, data: Uint8Array.from({ length: 63 }, (_, pixel) => Number(pixel === 31)) },
    });
    expect(image.data).toEqual(original);
  });

  it('uses the upper median when the border colors split evenly', () => {
    const image = photo(2, 2, (pixel) => [pixel < 2 ? 0 : 20, 100, 200]);

    expect(floodMaskOf(image).mask?.data).toEqual(new Uint8Array([1, 1, 0, 0]));
  });

  it('separates a subject from small independent variations in each background channel', () => {
    const image = photo(7, 7, (pixel) => {
      if (pixel === 24) return [0, 0, 0];

      return [40 + (pixel % 9), 120 + ((pixel * 7) % 9), 220 + ((pixel * 5) % 9)];
    });

    expect(floodMaskOf(image).mask?.data).toEqual(Uint8Array.from({ length: 49 }, (_, pixel) => Number(pixel === 24)));
  });

  it('keeps corner weighting and enclosed background', () => {
    const image = photo(3, 3, (pixel) => [[0, 2, 4, 6].includes(pixel) ? 20 : 0, 100, 200]);

    expect(floodMaskOf(image).mask?.data).toEqual(new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 1]));
  });

  it('measures each channel independently and keeps the color distance boundary', () => {
    const image = photo(6, 6, (pixel) => {
      if (pixel === 14) return [112, 120, 140];

      if (pixel === 15) return [107, 127, 147];

      return [100, 120, 140];
    });

    expect(floodMaskOf(image).mask?.data).toEqual(Uint8Array.from({ length: 36 }, (_, pixel) => Number(pixel === 15)));
  });

  it('accepts a spread of fourteen and refuses a busier border', () => {
    const atLimit = photo(2, 2, (pixel) => [pixel < 2 ? 100 : 128, 100, 100]);
    const overLimit = photo(2, 2, (pixel) => [pixel < 2 ? 100 : 129, 100, 100]);

    expect(floodMaskOf(atLimit).mask?.data).toEqual(new Uint8Array([1, 1, 0, 0]));
    expect(floodMaskOf(overLimit)).toEqual({ reason: 'the background isn’t plain (busy scene or gradient)' });
  });

  it('matches full border decisions across narrow, varied and threshold-adjacent photos', () => {
    for (const width of [1, 2, 7, 32]) {
      for (const height of [1, 2, 9]) {
        for (const variation of [0, 12, 28, 29, 255]) {
          const image = photo(width, height, (pixel) => [pixel % 2 ? variation : 0, 100, 100]);

          expect(Boolean(floodMaskOf(image).reason)).toBe(fullBorderSpread(image) > 14);
        }
      }
    }
  });

  it('stops busy border distances at the decisive sample and scans plain borders completely', () => {
    const busy = photo(100, 100, (pixel) => [pixel < 5000 ? 0 : 255, 100, 100]);
    const plain = photo(100, 100, () => [0, 100, 100]);
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      expect(floodMaskOf(busy).reason).toBeDefined();
      expect(hypot).toHaveBeenCalledTimes(43);
      hypot.mockClear();
      expect(floodMaskOf(plain).reason).toBeUndefined();
      expect(hypot).toHaveBeenCalledTimes(400);
    } finally {
      hypot.mockRestore();
    }
  });

  it.each([
    [1, 1],
    [1, 7],
    [7, 1],
  ])('handles a %i by %i image', (width, height) => {
    expect(floodMaskOf(photo(width, height, () => [12, 130, 240])).mask?.data).toEqual(new Uint8Array(width * height));
  });
});
