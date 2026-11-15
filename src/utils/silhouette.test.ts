import { describe, expect, it } from 'vitest';
import { floodMaskOf } from './silhouette';

type Color = [number, number, number];

function photo(width: number, height: number, color: (pixel: number) => Color): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel++) data.set([...color(pixel), 255], pixel * 4);

  return { data, width, height, colorSpace: 'srgb' };
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

  it.each([
    [1, 1],
    [1, 7],
    [7, 1],
  ])('handles a %i by %i image', (width, height) => {
    expect(floodMaskOf(photo(width, height, () => [12, 130, 240])).mask?.data).toEqual(new Uint8Array(width * height));
  });
});
