import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { expandToGroups } from '../utils/selection';
import { addIds, clickSelection, toggleIds } from './selection';

function part(id: string, group?: ScenePart['group']): ScenePart {
  return {
    id,
    name: id,
    kind: 'box',
    category: 'primitives',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 10, height: 10, depth: 10 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    group,
  };
}

function counted<T>(items: T[]) {
  let reads = 0;
  const values = new Proxy(items, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, receiver);
    },
  });

  return { values, reads: () => reads };
}

describe('ordered group selection', () => {
  it('keeps the primary selection and appends group members in scene order', () => {
    const left = { id: 'left', name: 'Leg' };
    const right = { id: 'right', name: 'Leg' };
    const parts = [
      part('a', left),
      part('x', right),
      { ...part('b', left), locked: true },
      part('loose'),
      { ...part('c', left), visible: false },
      part('y', right),
    ];
    const ids = ['c', 'missing', 'x', 'c', 'loose'];

    expect(expandToGroups(parts, ids)).toEqual([...ids, 'a', 'b', 'y']);
    expect(expandToGroups(parts, ['loose', 'missing'])).toEqual(['loose', 'missing']);
    expect(expandToGroups(parts, [])).toEqual([]);
    expect(ids).toEqual(['c', 'missing', 'x', 'c', 'loose']);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('preserves group toggles and drill-in for selection subset %i', (mask) => {
    const unit = ['a', 'b', 'c'];
    const prev = ['outside', ...unit.filter((_, i) => mask & (1 << i))];
    const added = [...prev, ...unit.filter((id) => !prev.includes(id))];
    const toggled = mask === 7 ? ['outside'] : added;

    expect(addIds(prev, unit)).toEqual(added);
    expect(toggleIds(prev, unit)).toEqual(toggled);

    const modifiers = [
      { additive: false, drill: false },
      { additive: false, drill: true },
      { additive: true, drill: false },
      { additive: true, drill: true },
    ];

    for (const options of modifiers) {
      const target = options.drill || (mask > 0 && mask < 7) ? ['b'] : unit;
      const toggledTarget = prev.includes('b') ? prev.filter((id) => id !== 'b') : [...prev, 'b'];
      const changed = target === unit ? toggled : toggledTarget;
      const expected = options.additive ? changed : target;

      expect(clickSelection(prev, 'b', unit, options)).toEqual(expected);
    }

    expect(prev).toEqual(['outside', ...unit.filter((_, i) => mask & (1 << i))]);
  });

  it('keeps existing duplicate and empty-list behavior', () => {
    expect(addIds(['a'], ['b', 'b', 'a', 'missing'])).toEqual(['a', 'b', 'b', 'missing']);
    expect(toggleIds(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(toggleIds(['a', 'b', 'c'], ['b', 'a'])).toEqual(['c']);
  });

  it.each([1, 200])('expands 600 parts across %i groups with linear scene and selection reads', (groups) => {
    const size = 600;
    const parts = counted(
      Array.from({ length: size }, (_, i) => part(`p${i}`, { id: `g${i % groups}`, name: `Group ${i % groups}` })),
    );
    const ids = counted(Array.from({ length: size / 2 }, (_, i) => `p${size - 1 - i}`));
    const expanded = expandToGroups(parts.values, ids.values);

    expect(parts.reads() + ids.reads()).toBeLessThan(size * 12);
    expect(expanded).toEqual([
      ...Array.from({ length: size / 2 }, (_, i) => `p${size - 1 - i}`),
      ...Array.from({ length: size / 2 }, (_, i) => `p${i}`),
    ]);
  });

  it.each(['add', 'toggle', 'click'] as const)('%s reads large selections in linear work', (operation) => {
    const size = 600;
    const prev = counted(Array.from({ length: size }, (_, i) => `p${i}`));
    const unit = counted(Array.from({ length: size }, (_, i) => `p${size - 1 - i}`));
    const operations = {
      add: () => addIds(prev.values, unit.values),
      toggle: () => toggleIds(prev.values, unit.values),
      click: () => clickSelection(prev.values, 'p0', unit.values, { additive: true, drill: false }),
    };
    const selected = operations[operation]();

    expect(prev.reads() + unit.reads()).toBeLessThan(size * 12);
    expect(selected).toEqual(operation === 'add' ? Array.from({ length: size }, (_, i) => `p${i}`) : []);
  });
});
