import { describe, expect, it, vi } from 'vitest';
import { combinations } from './combinations';

function expectedIndices(length: number, count: number): number[][] {
  return Array.from({ length: 2 ** length }, (_, mask) =>
    Array.from({ length }, (_, index) => index).filter((index) => mask & (1 << index)),
  )
    .filter((indices) => indices.length === count)
    .sort((a, b) => {
      const first = a.findIndex((value, index) => value !== b[index]);

      return first < 0 ? 0 : a[first] - b[first];
    });
}

describe('combinations', () => {
  it('matches every ordered subset through ten items, including empty and complete selections', () => {
    for (let length = 0; length <= 10; length++) {
      const items = Array.from({ length }, (_, index) => ({ index }));

      for (let count = 0; count <= length + 1; count++) {
        const actual = [...combinations(items, count)];
        const expected = expectedIndices(length, count).map((indices) => indices.map((index) => items[index]));

        expect(actual).toEqual(expected);
        expect(actual.every((values) => values.every((item) => item === items[item.index]))).toBe(true);
      }
    }
  });

  it('selects by position when values repeat and leaves the source intact', () => {
    const items = Object.freeze(['a', 'a', 'b', 'a']);

    expect([...combinations(items, 2)]).toEqual([
      ['a', 'a'],
      ['a', 'b'],
      ['a', 'a'],
      ['a', 'b'],
      ['a', 'a'],
      ['b', 'a'],
    ]);
    expect(items).toEqual(['a', 'a', 'b', 'a']);
  });

  it('keeps yielded arrays and interleaved traversals independent', () => {
    const items = [0, 1, 2, 3];
    const first = combinations(items, 2);
    const second = combinations(items, 3);
    const kept = first.next().value!;

    kept[0] = 99;
    expect(second.next().value).toEqual([0, 1, 2]);
    expect(first.next().value).toEqual([0, 2]);
    expect(second.next().value).toEqual([0, 1, 3]);
    expect([...first]).toEqual([
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    expect(kept).toEqual([99, 1]);
    expect(items).toEqual([0, 1, 2, 3]);
    items[0] = 7;
    expect(combinations(items, 2).next().value).toEqual([7, 1]);
  });

  it('reads only requested results and stops without preparing another candidate', () => {
    const read: string[] = [];
    const items = new Proxy(
      Array.from({ length: 600 }, (_, index) => index),
      {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) read.push(key);

          return Reflect.get(target, key, receiver);
        },
      },
    );
    const iterator = combinations(items, 300);

    expect(read).toEqual([]);
    expect(iterator.next().value).toEqual(Array.from({ length: 300 }, (_, index) => index));
    expect(read).toHaveLength(300);
    iterator.return(undefined);
    expect(read).toHaveLength(300);
    expect(iterator.next().done).toBe(true);
  });

  it.each([300, 600])('avoids prefix-copy iterators for a complete %i-item selection', (length) => {
    const items = Array.from({ length }, (_, index) => index);
    const iterator = combinations(items, length);
    const spy = vi.spyOn(Array.prototype, Symbol.iterator);
    let copies: number;

    try {
      iterator.next();
      iterator.next();
      copies = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }

    expect(copies).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-count %s', (count) => {
    expect([...combinations([0, 1], count)]).toEqual([]);
  });
});
