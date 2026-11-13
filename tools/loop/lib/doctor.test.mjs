import { describe, expect, it } from 'vitest';
import { failingLanes, shouldCall } from './doctor.mjs';

const now = Date.parse('2026-11-13T18:00:00Z');
const minutesAgo = (m) => now - m * 60_000;

describe('calling the doctor', () => {
  it('names a lane whose last three runs failed, and not one that failed then recovered', () => {
    const failed = (n) => `2026-11-13T17:0${n}:00.000Z [merge-1] failed: SyntaxError: nope`;
    const logs = {
      merge: [failed(1), '    at x (file.mjs:1)', failed(2), failed(3)].join('\n'),
      review: [failed(1), failed(2), '2026-11-13T17:03:00.000Z [review-1] #12: pass, 0 blockers'].join('\n'),
    };

    expect(failingLanes(logs)).toEqual(['merge']);
  });

  it('names a lane that failed five times in the last hour even when other slots succeeded between', () => {
    const at = (m, text) => `2026-11-13T17:${String(m).padStart(2, '0')}:00.000Z [rebase-${(m % 3) + 1}] ${text}`;
    const lines = [0, 5, 10, 15, 20].flatMap((m) => [
      at(m, 'failed: Error: git commit failed'),
      at(m + 1, '#7: brought up to date with main'),
    ]);

    expect(failingLanes({ rebase: lines.join('\n') }, Date.parse('2026-11-13T17:30:00Z'))).toEqual(['rebase']);
    expect(failingLanes({ rebase: lines.join('\n') }, Date.parse('2026-11-13T19:30:00Z'))).toEqual([]);
  });

  it('comes after 45 minutes of a stall or at once for a failing lane, and not again within two hours', () => {
    const quiet = { breaches: [], failing: [], stalledSince: null, lastCallAt: null, now };

    expect(shouldCall(quiet)).toBe(false);
    expect(shouldCall({ ...quiet, breaches: ['main has been red'], stalledSince: minutesAgo(30) })).toBe(false);
    expect(shouldCall({ ...quiet, breaches: ['main has been red'], stalledSince: minutesAgo(50) })).toBe(true);
    expect(shouldCall({ ...quiet, failing: ['merge'] })).toBe(true);
    expect(shouldCall({ ...quiet, failing: ['merge'], lastCallAt: minutesAgo(60) })).toBe(false);
    expect(shouldCall({ ...quiet, failing: ['merge'], lastCallAt: minutesAgo(130) })).toBe(true);
  });
});
