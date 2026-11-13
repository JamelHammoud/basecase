import { describe, expect, it } from 'vitest';
import { nightlyDue } from './nightly.mjs';

describe('the nightly release backstop', () => {
  it('starts the nightly when GitHub never ran it today', () => {
    expect(nightlyDue(new Date('2026-11-13T15:00:00Z'), '2026-11-12T09:20:00Z')).toBe(true);
    expect(nightlyDue(new Date('2026-11-13T15:00:00Z'), null)).toBe(true);
  });

  it('leaves it alone once it ran today', () => {
    expect(nightlyDue(new Date('2026-11-13T15:00:00Z'), '2026-11-13T09:21:00Z')).toBe(false);
  });

  it('gives the scheduled run its grace before stepping in', () => {
    expect(nightlyDue(new Date('2026-11-13T09:30:00Z'), '2026-11-12T09:20:00Z')).toBe(false);
    expect(nightlyDue(new Date('2026-11-13T09:50:00Z'), '2026-11-12T09:20:00Z')).toBe(true);
  });
});
