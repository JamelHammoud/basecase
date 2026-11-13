import { describe, expect, it } from 'vitest';
import { agoPhrase, clockTime, dayLabel, fullDate, timeAgo } from './timeAgo';

const now = new Date('2026-11-13T15:00:00');
const before = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

describe('timeAgo', () => {
  it('counts minutes, hours and days, then names the day', () => {
    expect(timeAgo(before(30), now)).toBe('now');
    expect(timeAgo(before(5 * 60), now)).toBe('5m');
    expect(timeAgo(before(2 * 3600), now)).toBe('2h');
    expect(timeAgo(before(3 * 86400), now)).toBe('3d');
    expect(timeAgo(new Date('2026-11-04T09:00:00').toISOString(), now)).toBe('Nov 4');
  });

  it('adds the year only for another year', () => {
    expect(timeAgo(new Date('2025-11-04T09:00:00').toISOString(), now)).toBe('Nov 4, 2025');
  });
});

describe('agoPhrase', () => {
  it('reads as a phrase after a verb', () => {
    expect(agoPhrase(before(10), now)).toBe('just now');
    expect(agoPhrase(before(5 * 60), now)).toBe('5m ago');
    expect(agoPhrase(new Date('2026-10-01T09:00:00').toISOString(), now)).toBe('Oct 1');
  });
});

describe('dayLabel', () => {
  it('reads a local date without shifting the day', () => {
    expect(dayLabel('2026-10-29', now)).toBe('Oct 29');
    expect(dayLabel('2025-12-31', now)).toBe('Dec 31, 2025');
  });

  it('shows text it cannot read as written', () => {
    expect(dayLabel('today', now)).toBe('today');
    expect(timeAgo('', now)).toBe('');
    expect(agoPhrase('soon', now)).toBe('soon');
  });
});

describe('fullDate', () => {
  it('spells out the month and always keeps the year', () => {
    expect(fullDate(now)).toBe('November 13, 2026');
  });
});

describe('clockTime', () => {
  it('reads the same on every machine, with a plain space', () => {
    expect(clockTime(new Date('2026-11-13T14:32:00'))).toBe('2:32 PM');
    expect(clockTime(new Date('2026-11-13T09:05:00').getTime())).toBe('9:05 AM');
  });
});
