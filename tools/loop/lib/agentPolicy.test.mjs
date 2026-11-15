import { afterEach, describe, expect, it, vi } from 'vitest';
import { overflowAvailable, policyFor, primaryAvailable, primaryReserve, weeklyForecast } from './agentPolicy.mjs';

afterEach(() => vi.unstubAllEnvs());

const now = Date.UTC(2026, 10, 15);
const reset = now + 86_400_000;
const snapshot = (used, at = now) => ({ at, windows: [{ minutes: 10080, used, reset }] });

describe('provider policy', () => {
  it('keeps implementation and writing on Codex with explicit effort and independent deep review', () => {
    vi.stubEnv('BASECASE_LOOP_PROVIDER', '');
    vi.stubEnv('CODEX_EFFORT', '');

    expect(policyFor('build')).toMatchObject({ provider: 'codex', effort: 'medium' });
    expect(policyFor('voice').provider).toBe('codex');
    expect(policyFor('review').effort).toBe('high');
  });

  it('refuses overflow without fresh allowance data, or near the personal reserve', () => {
    expect(overflowAvailable({ used: null, now })).toBe(false);
    expect(overflowAvailable({ used: snapshot(10, now - 300_001), now })).toBe(false);
    expect(overflowAvailable({ used: snapshot(80), now })).toBe(false);
    expect(overflowAvailable({ used: snapshot(10), now })).toBe(true);
  });

  it('limits overflow to five weekly percentage points and starts a fresh budget at reset', () => {
    const baseline = { used: 20, reset };

    expect(overflowAvailable({ used: snapshot(24), baseline, now })).toBe(true);
    expect(overflowAvailable({ used: snapshot(25), baseline, now })).toBe(false);
    expect(overflowAvailable({ used: snapshot(2), baseline: { used: 20, reset: reset - 1 }, now })).toBe(true);
  });

  it('forecasts from the provider reset rather than the local midnight', () => {
    expect(weeklyForecast({ used: 10, reset: now + 6 * 86_400_000, now })).toBe(70);
    expect(weeklyForecast({ used: 10, reset: now + 7 * 86_400_000, now })).toBeNull();
  });

  it('preserves the final ten weekly percentage points at admission without imposing daily stops', () => {
    expect(primaryReserve(snapshot(89), now)).toBeUndefined();
    expect(primaryReserve(snapshot(90), now)).toMatchObject({ used: 90, reset });
    expect(primaryReserve(snapshot(95), reset + 1)).toBeUndefined();
  });

  it('recognizes restored primary allowance only from fresh usable quota', () => {
    expect(primaryAvailable(snapshot(5), now)).toBe(true);
    expect(primaryAvailable(snapshot(5, now - 60_001), now)).toBe(false);
    expect(primaryAvailable(snapshot(90), now)).toBe(false);
    expect(primaryAvailable({ at: now, windows: [] }, now)).toBe(false);
    expect(
      primaryAvailable({ ...snapshot(5), windows: [...snapshot(5).windows, { minutes: 300, used: 100 }] }, now),
    ).toBe(false);
  });
});
