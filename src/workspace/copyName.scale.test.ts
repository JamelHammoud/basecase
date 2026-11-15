import { describe, expect, it } from 'vitest';
import { copyName } from './helpers';

describe('duplicate name allocation', () => {
  it.each([
    { name: 'Leg copy 12', taken: ['Leg copy', 'Leg copy 3'], expected: 'Leg copy 2' },
    { name: 'Leg COPY 12', taken: ['Leg Copy', 'Leg copy 2'], expected: 'Leg copy' },
    { name: 'Leg copy', taken: ['Leg copy', 'Leg copy', 'Leg copy 02'], expected: 'Leg copy 2' },
    { name: 'Leg', taken: ['Leg copy 2'], expected: 'Leg copy' },
  ])('keeps the first available name for $name among $taken', ({ name, taken, expected }) => {
    const original = [...taken];

    expect(copyName(name, taken)).toBe(expected);
    expect(taken).toEqual(original);
  });

  it.each([600, 1200])('bounds name reads for %i existing copies', (size) => {
    let reads = 0;
    const names = Array.from({ length: size }, (_, i) => (i === 0 ? 'Sprout copy' : `Sprout copy ${i + 1}`));
    const taken = new Proxy(names, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });

    expect(copyName('Sprout copy 2', taken)).toBe(`Sprout copy ${size + 1}`);
    expect(reads).toBeLessThanOrEqual(size * 2);
  });
});
