import { describe, expect, it } from 'vitest';
import { jsonHash, numbersHash } from './geometryHash';

describe('geometry hashes', () => {
  it('tell apart meshes that differ by one number anywhere', () => {
    const mesh = (value: number) => Array.from({ length: 900 }, (_, i) => (i === 800 ? value : i));

    expect(numbersHash(mesh(1))).not.toBe(numbersHash(mesh(5000)));
    expect(numbersHash(mesh(1))).toBe(numbersHash(mesh(1)));
  });

  it('measure each array once, since parts are replaced, never changed', () => {
    const positions = [1, 2, 3];
    const first = numbersHash(positions);

    positions[0] = 9;

    expect(numbersHash(positions)).toBe(first);
  });

  it('read nothing as empty', () => {
    expect(numbersHash(undefined)).toBe('');
    expect(jsonHash(null)).toBe('');
  });

  it('hash objects by value', () => {
    expect(jsonHash({ a: 1 })).toBe(jsonHash({ a: 1 }));
    expect(jsonHash({ a: 1 })).not.toBe(jsonHash({ a: 2 }));
  });
});
