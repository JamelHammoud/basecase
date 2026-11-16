import { describe, expect, it, vi } from 'vitest';
import { minimalClosures } from './minimalClosures';

function previousMinimal(sets: Set<number>[]): Set<number>[] {
  const subset = (a: Set<number>, b: Set<number>) => [...a].every((id) => b.has(id));
  const kept: Set<number>[] = [];

  for (const candidate of sets) {
    if (kept.some((other) => subset(other, candidate))) continue;

    const supersets = kept.filter((other) => subset(candidate, other));

    supersets.forEach((other) => kept.splice(kept.indexOf(other), 1));
    kept.push(candidate);
  }

  return kept;
}

describe('minimal teardown closures', () => {
  it('matches stable pruning across every ordered triple of subsets', () => {
    const subsets = Array.from({ length: 8 }, (_, bits) => new Set([0, 1, 2].filter((id) => bits & (1 << id))));

    for (let fixture = 0; fixture < 512; fixture++) {
      const sets = [subsets[fixture % 8], subsets[Math.floor(fixture / 8) % 8], subsets[Math.floor(fixture / 64)]];
      const before = sets.map((set) => [...set]);
      const expected = previousMinimal(sets);
      const actual = minimalClosures(sets);

      expect(actual).toEqual(expected);
      actual.forEach((set, index) => expect(set).toBe(expected[index]));
      expect(sets.map((set) => [...set])).toEqual(before);
    }
  });

  it('keeps survivor order through nonadjacent removals, ties and later input edits', () => {
    const sets = [[1, 2], [3], [1, 4], [5], [1], [1]].map((ids) => new Set(ids));
    const result = minimalClosures(sets);

    expect(result).toEqual([sets[1], sets[3], sets[4]]);
    expect(result[2]).toBe(sets[4]);
    expect(minimalClosures([])).toEqual([]);

    sets[1].add(1);

    expect(minimalClosures(sets)).toEqual([sets[3], sets[4]]);
    expect(result).toHaveLength(3);
    expect(minimalClosures([new Set(), ...sets])).toEqual([new Set()]);
  });

  it.each([300, 600])('avoids impossible subset iterations across %i nested alternatives', (count) => {
    const sets = Array.from({ length: count }, (_, i) => new Set(Array.from({ length: count - i }, (_, id) => id)));
    const iterators = sets.map((set) => vi.spyOn(set, Symbol.iterator));
    const expected = previousMinimal(sets);
    const before = iterators.reduce((total, iterator) => total + iterator.mock.calls.length, 0);

    iterators.forEach((iterator) => iterator.mockClear());

    const result = minimalClosures(sets);
    const after = iterators.reduce((total, iterator) => total + iterator.mock.calls.length, 0);

    expect(result).toEqual(expected);
    expect(before).toBe(2 * (count - 1));
    expect(after).toBe(count - 1);
    iterators.forEach((iterator) => iterator.mockRestore());
  });
});
