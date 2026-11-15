import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateGroupLabel, groupByDate } from './dateGroups';

const DAY = 86_400_000;
const now = new Date(2026, 10, 14, 15);
const midnight = new Date(2026, 10, 14).getTime();
const itemAt = (id: string, time: number) => ({ id, updatedAt: new Date(time).toISOString() });

afterEach(() => vi.restoreAllMocks());

describe('date grouping', () => {
  it('keeps exact recent boundaries and month labels in both entry points', () => {
    const cases: [number, string][] = [
      [midnight + 2 * DAY, 'Today'],
      [midnight, 'Today'],
      [midnight - 1, 'Yesterday'],
      [midnight - DAY, 'Yesterday'],
      [midnight - DAY - 1, 'Previous 7 days'],
      [midnight - 7 * DAY, 'Previous 7 days'],
      [midnight - 7 * DAY - 1, 'November'],
      [new Date(2026, 9, 1).getTime(), 'October'],
      [new Date(2025, 11, 31).getTime(), 'December 2025'],
    ];
    const items = cases.map(([time], index) => itemAt(String(index), time));

    expect(items.map((item) => dateGroupLabel(item.updatedAt, now))).toEqual(cases.map(([, label]) => label));
    expect(groupByDate(items.toReversed(), now)).toEqual([
      { label: 'Today', items: items.slice(0, 2) },
      { label: 'Yesterday', items: items.slice(2, 4) },
      { label: 'Previous 7 days', items: items.slice(4, 6) },
      { label: 'November', items: items.slice(6, 7) },
      { label: 'October', items: items.slice(7, 8) },
      { label: 'December 2025', items: items.slice(8) },
    ]);
  });

  it('sorts absolute times with stable ties and preserves the source array and objects', () => {
    const items = [
      { id: 'older', updatedAt: '2026-11-14T11:00:00Z' },
      { id: 'first', updatedAt: '2026-11-14T08:00:00-05:00' },
      { id: 'second', updatedAt: '2026-11-14T14:00:00+01:00' },
      { id: 'newest', updatedAt: '2026-11-14T12:30:00-01:00' },
    ];
    const before = structuredClone(items);

    items.forEach(Object.freeze);
    Object.freeze(items);

    const grouped = groupByDate(items, now).flatMap((group) => group.items);

    expect(grouped.map((item) => item.id)).toEqual(['newest', 'first', 'second', 'older']);
    expect(items).toEqual(before);
    expect(grouped[1]).toBe(items[1]);
  });

  it('reads changed timestamps and a changed calendar afresh without mutating earlier groups', () => {
    const item = itemAt('scene', midnight);
    const original = groupByDate([item], now);

    expect(groupByDate([item], new Date(2026, 10, 15, 15))[0].label).toBe('Yesterday');

    item.updatedAt = new Date(2025, 0, 1).toISOString();

    expect(groupByDate([item], now)[0].label).toBe('January 2025');
    expect(original[0].label).toBe('Today');
    expect(groupByDate([], now)).toEqual([]);
  });

  it('retains refusal of unreadable timestamps', () => {
    expect(() => groupByDate([{ updatedAt: 'unreadable' }], now)).toThrow(RangeError);
    expect(() => dateGroupLabel('unreadable', now)).toThrow(RangeError);
  });

  it.each([new Date(2027, 0, 1, 15), new Date(2026, 2, 9, 15), new Date(2026, 10, 2, 15)])(
    'keeps elapsed-day cutoffs around calendar transitions at %s',
    (current) => {
      const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
      const times = [start, start - DAY, start - 7 * DAY];

      expect(
        groupByDate(
          times.map((time, index) => itemAt(String(index), time)),
          current,
        ).map((group) => group.label),
      ).toEqual(['Today', 'Yesterday', 'Previous 7 days']);
    },
  );

  it.each([300, 600])('parses each of %i entries once across sorting and grouping', (count) => {
    const items = Array.from({ length: count }, (_, index) =>
      itemAt(String(index), midnight - ((index * 137) % count) * DAY),
    );
    const parse = vi.spyOn(Date, 'parse');
    const year = vi.spyOn(now, 'getFullYear');
    const groups = groupByDate(items, now);

    expect(groups.flatMap((group) => group.items)).toHaveLength(count);
    expect(parse).toHaveBeenCalledTimes(count);
    expect(year).toHaveBeenCalledTimes(1);
  });
});
