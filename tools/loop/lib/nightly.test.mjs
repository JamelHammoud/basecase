import { describe, expect, it } from 'vitest';
import { nextVersion, nightlyDue, releaseDue, rerunSuite, suiteDue } from './nightly.mjs';

const at = (iso) => new Date(iso);

describe('the nightly release backstop', () => {
  it('starts the nightly when GitHub never ran it today', () => {
    expect(nightlyDue(at('2026-11-13T15:00:00Z'), '2026-11-12T09:20:00Z')).toBe(true);
    expect(nightlyDue(at('2026-11-13T15:00:00Z'), null)).toBe(true);
  });

  it('leaves it alone once it ran today', () => {
    expect(nightlyDue(at('2026-11-13T15:00:00Z'), '2026-11-13T09:21:00Z')).toBe(false);
  });

  it('gives the scheduled run its grace before stepping in', () => {
    expect(nightlyDue(at('2026-11-13T09:30:00Z'), '2026-11-12T09:20:00Z')).toBe(false);
    expect(nightlyDue(at('2026-11-13T09:50:00Z'), '2026-11-12T09:20:00Z')).toBe(true);
  });
});

describe('the nightly full suite', () => {
  it('starts the suite when the 06:17 schedule skipped it', () => {
    expect(suiteDue(at('2026-11-13T07:10:00Z'), '2026-11-12T06:20:00Z')).toBe(true);
    expect(suiteDue(at('2026-11-13T06:40:00Z'), '2026-11-12T06:20:00Z')).toBe(false);
    expect(suiteDue(at('2026-11-13T07:10:00Z'), '2026-11-13T06:20:00Z')).toBe(false);
  });

  it('runs again after a failure or a cancelled run once main moves on, at most hourly, never over a running one', () => {
    const now = Date.parse('2026-11-13T09:00:00Z');
    const last = { conclusion: 'failure', headSha: 'aaa', createdAt: '2026-11-13T07:30:00Z' };

    expect(rerunSuite({ now, last, mainHead: 'bbb', running: false })).toBe(true);
    expect(rerunSuite({ now, last, mainHead: 'aaa', running: false })).toBe(false);
    expect(rerunSuite({ now, last, mainHead: 'bbb', running: true })).toBe(false);
    expect(rerunSuite({ now, last: { ...last, createdAt: '2026-11-13T08:30:00Z' }, mainHead: 'bbb' })).toBe(false);
    expect(rerunSuite({ now, last: { ...last, conclusion: 'success' }, mainHead: 'bbb' })).toBe(false);
    expect(rerunSuite({ now, last: { ...last, conclusion: 'cancelled' }, mainHead: 'bbb', running: false })).toBe(true);
  });

  it('releases once a day after 09:45 UTC, tries again every two hours, and never over a running release', () => {
    const now = Date.parse('2026-11-14T13:00:00Z');
    const base = { now, lastReleaseAt: '2026-11-02T15:40:00Z', lastAttemptAt: '2026-11-14T09:50:00Z', running: false };

    expect(releaseDue(base)).toBe(true);
    expect(releaseDue({ ...base, lastAttemptAt: '2026-11-14T12:00:00Z' })).toBe(false);
    expect(releaseDue({ ...base, running: true })).toBe(false);
    expect(releaseDue({ ...base, lastReleaseAt: '2026-11-14T10:30:00Z' })).toBe(false);
    expect(releaseDue({ ...base, now: Date.parse('2026-11-14T09:30:00Z'), lastAttemptAt: null })).toBe(false);
  });

  it('bumps the patch version', () => {
    expect(nextVersion('v0.1.2')).toBe('0.1.3');
    expect(nextVersion('0.9.9')).toBe('0.9.10');
  });
});
