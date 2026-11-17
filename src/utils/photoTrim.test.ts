import { expect, it } from 'vitest';
import { trimToModelWidth } from './photoMask';
import { maskBounds, type Mask } from './silhouetteProfile';

function previousTrim(mask: Mask, aspect: number) {
  const box = maskBounds(mask);

  if (box.x1 < 0 || !Number.isFinite(aspect) || aspect <= 0) return { mask, trimmed: 0 };

  const height = box.y1 - box.y0 + 1;
  const heights = Array.from({ length: box.x1 - box.x0 + 1 }, (_, i) => {
    let total = 0;

    for (let y = box.y0; y <= box.y1; y++) total += mask.data[y * mask.width + box.x0 + i];

    return total;
  });
  const area = heights.reduce((sum, value) => sum + value, 0);
  const centre = area ? heights.reduce((sum, value, i) => sum + value * i, 0) / area : heights.length / 2;
  const data = mask.data.slice();
  let removed = 0;

  heights.forEach((value, i) => {
    if (Math.abs(i - centre) <= (aspect * height * 1.3) / 2 || value > 0.3 * height) return;

    for (let y = box.y0; y <= box.y1; y++) data[y * mask.width + box.x0 + i] = 0;

    removed += value;
  });

  return { mask: { ...mask, data }, trimmed: area ? removed / area : 0 };
}

it('preserves trimmed pixels and mass fractions across sparse, asymmetric and nonbinary masks', () => {
  for (let seed = 0; seed < 80; seed++) {
    const width = 1 + (seed % 23);
    const height = 1 + (seed % 17);
    const data = new Uint8Array(width * height + 4).subarray(2, width * height + 2);

    for (let i = 0; i < data.length; i++) data[i] = (i * 31 + seed * 17) % 19 === 0 ? 1 + (seed % 3) : 0;

    const mask = { data, width, height };
    const source = data.slice();

    for (const aspect of [0.01, 0.1, 0.65, 1, 3, 0, -1, NaN, Infinity]) {
      expect(trimToModelWidth(mask, aspect)).toEqual(previousTrim(mask, aspect));
    }

    expect(data).toEqual(source);
  }
});

it('reads edited inputs afresh and gives each trimmed result its own pixels', () => {
  const mask: Mask = { data: new Uint8Array(40 * 10), width: 40, height: 10 };

  mask.data.fill(1, 160, 200);

  for (let y = 0; y < 10; y++) mask.data.fill(1, y * 40 + 18, y * 40 + 22);

  const first = trimToModelWidth(mask, 0.2);

  expect(first.trimmed).toBeGreaterThan(0);
  expect(first.mask.data).not.toBe(mask.data);
  mask.data.fill(0);
  mask.data[205] = 1;

  const second = trimToModelWidth(mask, 0.2);

  expect(second).toEqual(previousTrim(mask, 0.2));
  expect(second.mask.data).not.toBe(first.mask.data);
  expect(first.mask.data.some(Boolean)).toBe(true);
});
