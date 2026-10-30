import { describe, expect, it } from 'vitest';
import { checkMask, decodeVisionMasks, pickSubject, trimToModelWidth } from './photoMask';
import { bandVerdict, maskProfileOf, type Mask } from './silhouetteProfile';

type Shape = (x: number, y: number) => boolean;

function draw(width: number, height: number, ...shapes: Shape[]): Mask {
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = shapes.some((s) => s(x, y)) ? 1 : 0;

  return { data, width, height };
}

const rect =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
const disc =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function figure(k: number, torso = 1): Shape[] {
  const half = 30 * torso * k;

  return [
    disc(100 * k, 40 * k, 18 * k),
    rect(100 * k - half, 60 * k, 100 * k + half, 140 * k),
    rect(78 * k, 140 * k, 92 * k, 220 * k),
    rect(108 * k, 140 * k, 122 * k, 220 * k),
  ];
}

const toBase64 = (mask: Mask) => btoa(String.fromCharCode(...Array.from(mask.data, (v) => v * 255)));

describe('photo masks', () => {
  it('keeps the central subject and measures it like the model', () => {
    const robot = draw(200, 240, ...figure(1));
    const lamp = draw(200, 240, disc(12, 12, 8));
    const picked = pickSubject(decodeVisionMasks({ width: 200, height: 240, instances: [lamp, robot].map(toBase64) }));

    expect(picked?.kept).toBe(1);
    expect(checkMask(picked!.mask).refused).toBeUndefined();

    const photo = maskProfileOf(picked!.mask)!;
    const model = maskProfileOf(draw(400, 480, ...figure(2)))!;
    const verdict = bandVerdict(photo, model);

    expect(verdict.within).toBe(verdict.measured);
    expect(model.aspect).toBeCloseTo(photo.aspect, 1);
  });

  it('flags a model torso that is too narrow', () => {
    const photo = maskProfileOf(draw(200, 240, ...figure(1)))!;
    const model = maskProfileOf(draw(200, 240, ...figure(1, 0.6)))!;
    const verdict = bandVerdict(photo, model);

    expect(verdict.narrow.length).toBeGreaterThanOrEqual(3);
    expect(verdict.narrow.every((b) => b.ratio < 0.85)).toBe(true);
  });

  it('refuses a mask that swallowed the background', () => {
    const leaked = draw(200, 200, rect(0, 30, 199, 199));

    expect(checkMask(leaked).refused).toMatch(/covers 85% of the photo/);
  });

  it('notices a subject cut off by the frame', () => {
    const cropped = draw(200, 240, rect(60, 100, 140, 239));

    expect(checkMask(cropped).cut).toBe('bottom');
  });

  it('trims a thin sliver of background beside the subject', () => {
    const withPole = draw(300, 240, ...figure(1), rect(280, 40, 284, 80));
    const { mask, trimmed } = trimToModelWidth(withPole, 0.65);

    expect(trimmed).toBeGreaterThan(0.02);
    expect(maskProfileOf(mask)!.aspect).toBeLessThan(0.7);
  });
});
