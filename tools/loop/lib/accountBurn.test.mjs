import { describe, expect, it } from 'vitest';
import { accountBurn } from './accountBurn.mjs';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 16);
const reset = now + 6 * 24 * HOUR;
const reading = (used, at = now, bucket = 'codex', end = reset) => ({
  at,
  windows: [{ bucket, used, reset: end, minutes: 10080 }],
});

const burn = (current, samples, options = {}) => accountBurn({ current, samples, now, ...options })[0];

describe('account quota burn', () => {
  it('compares observed percentage points with the remaining weekly allowance rather than token totals', () => {
    const result = burn(reading(13), [reading(10, now - HOUR / 2)]);

    expect(result).toMatchObject({ scope: 'account', status: 'over', pointsUsed: 3, pointsPerHour: 6, minutes: 30 });
    expect(result.remainingBudgetPerHour).toBeCloseTo(77 / 144);
    expect(result.roundingRange).toEqual({ minimum: 4, maximum: 8 });
  });

  it('does not declare the week safe from one unchanged rounded reading', () => {
    expect(burn(reading(13), [reading(13, now - HOUR)])).toMatchObject({ status: 'uncertain', pointsPerHour: 0 });
    expect(burn(reading(13), [reading(13, now - HOUR / 4)]).status).toBe('insufficient-data');
  });

  it('reports within budget only when its whole rounding range fits the remaining allowance', () => {
    expect(
      burn(reading(10, now, 'codex', now + 10 * HOUR), [reading(10, now - HOUR, 'codex', now + 10 * HOUR)]).status,
    ).toBe('within');
  });

  it('never mixes quota windows, resets or future samples', () => {
    const samples = [
      reading(1, now - HOUR, 'other'),
      reading(1, now - HOUR, 'codex', reset - 1),
      reading(1, now + HOUR),
    ];

    expect(burn(reading(13), samples).status).toBe('insufficient-data');
    expect(accountBurn({ current: { at: now, windows: [] }, samples: [], now })).toEqual([]);
  });

  it('starts a new observation after a decreasing counter even if its reset timestamp stayed the same', () => {
    const samples = [reading(5, now - HOUR), reading(20, now - HOUR * 0.75), reading(0, now - HOUR / 4)];

    expect(burn(reading(1), samples).status).toBe('insufficient-data');
  });

  it('rejects stale or expired readings and does not use malformed historical samples', () => {
    expect(burn(reading(NaN), []).status).toBe('unavailable');
    expect(burn(reading(13, now - HOUR / 4), [reading(10, now - HOUR)]).status).toBe('stale');
    expect(burn(reading(13, now, 'codex', now), []).status).toBe('stale');
    expect(burn(reading(13), [undefined, { at: now - HOUR, windows: [] }, reading(NaN, now - HOUR)]).status).toBe(
      'insufficient-data',
    );
  });
});
