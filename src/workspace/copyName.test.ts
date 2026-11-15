import { describe, expect, it } from 'vitest';
import { copyName } from './helpers';

function countedNames(names: string[]) {
  let reads = 0;
  const values = new Proxy(names, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, receiver);
    },
  });

  return { values, reads: () => reads };
}

describe('duplicate name lookup', () => {
  it.each([1, 2048])('reads %i occupied copy names once while finding the next suffix', (size) => {
    const names = Array.from({ length: size }, (_, i) => (i === 0 ? 'Bracket copy' : `Bracket copy ${i + 1}`));
    const before = [...names];
    const taken = countedNames(names);

    expect(copyName('Bracket copy 12', taken.values)).toBe(`Bracket copy ${size + 1}`);
    expect(taken.reads()).toBeLessThanOrEqual(size);
    expect(names).toEqual(before);
  });

  it('fills the first gap without folding case or treating noncanonical suffixes as occupied', () => {
    const names = ['Bracket copy', 'Bracket copy 2', 'Bracket copy 4', 'Bracket copy 03', 'Bracket Copy 3'];

    expect(copyName('Bracket COPY 27', names)).toBe('Bracket copy 3');
    expect(copyName('Bracket', ['Bracket copy 2'])).toBe('Bracket copy');
    expect(copyName('Bracket copycat', [])).toBe('Bracket copycat copy');
    expect(copyName('Bracket copy 2 copy 3', [])).toBe('Bracket copy 2 copy');
  });

  it('reuses an existing name index without reserving names or retaining stale results', () => {
    const names = new Set(['Leg copy', 'Leg copy 2', 'Arm copy']);

    expect(copyName('Leg', names)).toBe('Leg copy 3');
    expect(copyName('Arm', names)).toBe('Arm copy 2');
    expect(copyName('Leg', names)).toBe('Leg copy 3');
    expect([...names]).toEqual(['Leg copy', 'Leg copy 2', 'Arm copy']);

    names.delete('Leg copy');

    expect(copyName('Leg', names)).toBe('Leg copy');

    names.add('Leg copy');
    names.add('Leg copy 3');

    expect(copyName('Leg', names)).toBe('Leg copy 4');
  });
});
