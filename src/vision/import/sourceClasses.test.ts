import { expect, it } from 'vitest';
import type { ImageClass } from '../frameSet';
import { sourceClasses } from './sourceClasses';

function scannedCategory(classes: ImageClass[], value: string | number): ImageClass {
  const existing = classes.find((category) =>
    typeof value === 'string' ? category.name === value : category.id === value,
  );

  if (existing) return existing;

  const category =
    typeof value === 'string' ? { id: classes.length, name: value } : { id: value, name: `class-${value}` };

  classes.push(category);

  return category;
}

it('matches ordered class scans across mixed names, sparse ids, collisions and repeated labels', () => {
  for (let seed = 0; seed < 80; seed++) {
    const initial = Array.from({ length: seed % 12 }, (_, i) => ({
      id: (i * 7 + seed) % 17,
      name: `label-${(i + seed) % 9}`,
      keypoints: [`point-${i}`],
    }));
    const before = structuredClone(initial);
    const classes: ImageClass[] = [...initial];
    const expected: ImageClass[] = structuredClone(initial);
    const index = sourceClasses(classes);

    for (let step = 0; step < 200; step++) {
      const value = step % 3 ? (step * 11 + seed) % 31 : `label-${(step * 13 + seed) % 23}`;
      const reference = scannedCategory(expected, value);
      const actual = index.inferred(value);

      expect(actual).toEqual(reference);
      expect(actual).toBe(classes[expected.indexOf(reference)]);
      expect(index.get(actual.id)).toBe(classes.find((category) => category.id === actual.id));
      expect(index.named(actual.name)).toBe(classes.find((category) => category.name === actual.name));
    }

    expect(classes).toEqual(expected);
    expect(initial).toEqual(before);
  }
});

it('keeps first duplicate matches and rebuilds from later edits without retaining another import', () => {
  const classes = [
    { id: 4, name: 'apple', keypoints: ['stem'] },
    { id: 4, name: 'pear', keypoints: ['tip'] },
    { id: 9, name: 'apple' },
  ];
  const index = sourceClasses(classes);

  expect(index.get(4)).toBe(classes[0]);
  expect(index.named('apple')).toBe(classes[0]);
  expect(index.named('pear')).toBe(classes[1]);
  expect(index.get(99)).toBeUndefined();

  classes[0] = { id: 10, name: 'orange' };

  const edited = sourceClasses(classes);
  const other = sourceClasses([]);

  expect(edited.get(4)).toBe(classes[1]);
  expect(edited.named('apple')).toBe(classes[2]);
  expect(other.inferred(4)).toEqual({ id: 4, name: 'class-4' });
  expect(other.get(10)).toBeUndefined();
});

it.each([NaN, Infinity, -1, 0.5, 0x100000000, undefined, null, {}, '', 'x'.repeat(201)])(
  'refuses malformed inferred labels: %s',
  (value) => {
    const classes: ImageClass[] = [];

    expect(() => sourceClasses(classes).inferred(value)).toThrow('Check the image dataset format.');
    expect(classes).toEqual([]);
  },
);

it('retains the class cap while accepting existing names and ids at the limit', () => {
  const classes = Array.from({ length: 1000 }, (_, id) => ({ id, name: `label-${id}` }));
  const index = sourceClasses(classes);

  expect(index.inferred(999)).toBe(classes[999]);
  expect(index.named('label-999')).toBe(classes[999]);
  expect(() => index.inferred(1000)).toThrow('Check the image dataset format.');
  expect(() => index.named('another')).toThrow('Check the image dataset format.');
  expect(index.get(1000)).toBeUndefined();
  expect(classes).toHaveLength(1000);
});

it.each([300, 600])('reads each of %s source ids and names once across repeated annotation lookups', (count) => {
  let ids = 0;
  let names = 0;
  const classes = Array.from({ length: count }, (_, id) => ({
    get id() {
      ids++;

      return id;
    },
    get name() {
      names++;

      return `label-${id}`;
    },
  }));
  const index = sourceClasses(classes);

  for (let step = 0; step < 3000; step++) {
    const id = step % count;

    expect(index.get(id)).toBe(classes[id]);
    expect(index.named(`label-${id}`)).toBe(classes[id]);
    expect(index.inferred(id)).toBe(classes[id]);
  }

  expect(ids).toBe(count);
  expect(names).toBe(count);
});
