import { expect, it } from 'vitest';
import { lensNoise } from './lensNoise';

it('reproduces seeded optical noise while retaining the alpha channel and honoring zero noise', () => {
  const first = new Uint8ClampedArray(400).fill(128);
  const repeated = first.slice();
  const different = first.slice();
  const clean = first.slice();

  lensNoise(first, 0.02, 123);
  lensNoise(repeated, 0.02, 123);
  lensNoise(different, 0.02, 124);
  lensNoise(clean, 0, 123);

  expect(repeated).toEqual(first);
  expect(different).not.toEqual(first);
  expect(clean).toEqual(new Uint8ClampedArray(400).fill(128));
  expect(first.filter((_, index) => index % 4 === 3)).toEqual(new Uint8ClampedArray(100).fill(128));
});
