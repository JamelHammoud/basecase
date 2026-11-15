import { describe, expect, it } from 'vitest';
import { SweepRaster, type Motion } from './sweepRaster';

const motion: Motion = { kind: 'prismatic', origin: [0, 0, 0], axis: [0, 0, 1], range: [-2, 3] };

function countedSoup(soup: Float32Array) {
  let reads = 0;
  const counted = new Proxy(soup, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, target);
    },
  });

  return { counted, reads: () => reads };
}

describe('shell sweep sampling work', () => {
  it.each([300, 600])('reads each coordinate once across %i triangles and rereads edited soups', (count) => {
    const soup = Float32Array.from(Array.from({ length: count }, () => [0, 0, 0, 3, 0, 0, 0, 4, 0]).flat());
    const source = soup.slice();
    const { counted, reads } = countedSoup(soup);
    const first = new SweepRaster(motion, 1);

    first.addSoup(counted);
    first.seal();
    expect(reads()).toBe(count * 9);
    expect(first.hits(1, 1, 0)).toBe(true);
    expect(first.hits(21, 1, 0)).toBe(false);
    expect(soup).toEqual(source);

    for (let i = 0; i < soup.length; i += 3) soup[i] += 20;

    const second = new SweepRaster(motion, 1);

    second.addSoup(counted);
    second.seal();
    expect(reads()).toBe(count * 18);
    expect(second.hits(1, 1, 0)).toBe(false);
    expect(second.hits(21, 1, 0)).toBe(true);
    expect(first.hits(1, 1, 0)).toBe(true);
  });
});
