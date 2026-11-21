import { describe, expect, it, vi } from 'vitest';
import { TimelineCursor } from './timelineCursor';

describe('scheduled simulation events', () => {
  it('orders once, keeps equal-time order and consumes each event once across repeated or backward ticks', () => {
    const entries = Object.freeze(
      [
        { at: 2, id: 'last' },
        { at: 1, id: 'first tie' },
        { at: -1, id: 'before start' },
        { at: 1, id: 'second tie' },
        { at: 3, id: 'future' },
      ].map((entry) => Object.freeze(entry)),
    );
    const seen: string[] = [];
    const cursor = new TimelineCursor(
      entries,
      (e) => e.at,
      (e) => seen.push(e.id),
    );

    cursor.advance(0);
    expect(seen).toEqual(['before start']);
    cursor.advance(1 - 2e-9);
    expect(cursor.remaining).toBe(4);
    cursor.advance(1 - 0.5e-9);
    expect(seen).toEqual(['before start', 'first tie', 'second tie']);
    cursor.advance(1);
    cursor.advance(0);
    expect(cursor.remaining).toBe(2);
    cursor.advance(20);
    cursor.advance(30);
    expect(seen).toEqual(['before start', 'first tie', 'second tie', 'last', 'future']);
    expect(cursor.remaining).toBe(0);
    expect(entries.map((e) => e.id)).toEqual(['last', 'first tie', 'before start', 'second tie', 'future']);
  });

  it('reads each pending deadline once while consuming a long schedule', () => {
    const entries = Array.from({ length: 20_000 }, (_, i) => i / 10);
    const at = vi.fn((t: number) => t);
    let total = 0;
    const cursor = new TimelineCursor(entries, at, (t) => {
      total += t;
    });

    at.mockClear();

    for (let tick = 0; tick <= 2000; tick++) cursor.advance(tick);

    expect(total).toBeCloseTo(entries.reduce((sum, t) => sum + t, 0));
    expect(cursor.remaining).toBe(0);
    expect(at).toHaveBeenCalledTimes(entries.length - 1);
  });

  it('retains independent deadlines across sparse schedules and idle ticks', () => {
    const at = vi.fn((t: number) => t);
    const seen: number[] = [];
    const other: number[] = [];
    const entries = Array.from({ length: 100 }, (_, i) => (i + 1) * 1000);
    const cursor = new TimelineCursor(entries, at, (t) => seen.push(t));
    const second = new TimelineCursor(
      [500, 1500],
      (t) => t,
      (t) => other.push(t),
    );

    at.mockClear();

    for (let tick = 0; tick <= 100_000; tick++) {
      cursor.advance(tick);
      second.advance(tick);
    }

    expect(seen).toEqual(entries);
    expect(other).toEqual([500, 1500]);
    expect(at).toHaveBeenCalledTimes(entries.length - 1);
    expect(cursor.remaining).toBe(0);
    expect(second.remaining).toBe(0);
  });

  it('advances empty schedules without visiting or reading a time', () => {
    const at = vi.fn((t: number) => t);
    const visit = vi.fn();
    const cursor = new TimelineCursor([], at, visit);

    cursor.advance(10);
    expect(cursor.remaining).toBe(0);
    expect(at).not.toHaveBeenCalled();
    expect(visit).not.toHaveBeenCalled();
  });
});
