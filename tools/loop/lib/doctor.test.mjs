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
