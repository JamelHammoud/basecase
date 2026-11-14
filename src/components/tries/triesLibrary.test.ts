import { describe, expect, it } from 'vitest';
import type { TryRecord } from '../../cases/tries';
import { matchTries, pick, robotGroups } from './triesLibrary';

const tryOf = (id: string, robot: string, kase: string | null, source: TryRecord['source'] = 'case') =>
  ({ id, robot: { name: robot, modelHash: 'm' }, case: kase && { id: kase, name: kase }, source }) as TryRecord;

const tries = [
  tryOf('a', 'SO-101', 'Pick Up a Block'),
  tryOf('b', 'Hexapod', 'Walk'),
  tryOf('c', 'SO-101', 'Touch the Dots', 'generated'),
];

describe('tries in the Library', () => {
  it('groups by robot and matches robot, Case and source', () => {
    expect(robotGroups(tries).map((g) => [g.robot, g.tries.map((t) => t.id)])).toEqual([
      ['Hexapod', ['b']],
      ['SO-101', ['a', 'c']],
    ]);
    expect(tries.filter(matchTries('so-1')).map((t) => t.id)).toEqual(['a', 'c']);
    expect(tries.filter(matchTries('walk')).map((t) => t.id)).toEqual(['b']);
    expect(tries.filter(matchTries('variation')).map((t) => t.id)).toEqual(['c']);
    expect(tries.filter(matchTries(' '))).toHaveLength(3);
  });

  it('picks one, toggles with ⌘ and adds a range with ⇧', () => {
    const order = ['a', 'b', 'c', 'd'];
    const one = pick(order, { ids: [], anchor: null }, { id: 'b', shift: false, toggle: false });
    const more = pick(order, one, { id: 'd', shift: false, toggle: true });
    const less = pick(order, more, { id: 'b', shift: false, toggle: true });
    const range = pick(order, one, { id: 'd', shift: true, toggle: false });

    expect(one).toEqual({ ids: ['b'], anchor: 'b' });
    expect(more.ids).toEqual(['b', 'd']);
    expect(less.ids).toEqual(['d']);
    expect(range).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b' });
  });
});
