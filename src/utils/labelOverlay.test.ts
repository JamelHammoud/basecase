import { describe, expect, it } from 'vitest';
import { labelAnchors, type LabelColor } from './labelOverlay';

describe('part labels', () => {
  it('puts each label inside its own part, even an L-shaped one', () => {
    const width = 100,
      height = 60;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const colors: LabelColor[] = [
      { id: 'base', label: 1, rgb: [200, 60, 40] },
      { id: 'arm', label: 2, rgb: [40, 120, 220] },
      { id: 'hidden', label: 3, rgb: [60, 200, 90] },
    ];
    const isBase = (x: number, y: number) => y >= 40 || x < 12;
    const paint = (x: number, y: number, rgb: number[]) => pixels.set([...rgb, 255], (y * width + x) * 4);

    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (isBase(x, y)) paint(x, y, [201, 59, 41]);
        else if (x > 60 && y < 30) paint(x, y, colors[1].rgb);
      }

    const anchors = labelAnchors(pixels, width, colors);
    const at = (label: number) => anchors.find((a) => a.label === label)!;

    expect(anchors.map((a) => a.label)).toEqual([1, 2]);
    expect(isBase(at(1).x, at(1).y)).toBe(true);
    expect(isBase(at(2).x, at(2).y)).toBe(false);
  });
});
