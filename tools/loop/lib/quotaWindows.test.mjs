import { describe, expect, it } from 'vitest';
import { claudeWindows } from './quotaWindows.mjs';
import { overflowAvailable } from './agentPolicy.mjs';

const now = Date.UTC(2026, 10, 15);
const reset = new Date(now + 86_400_000).toISOString();
const window = (utilization) => ({ utilization, resets_at: reset });
const usage = (extra = {}) => ({
  rate_limits_available: true,
  rate_limits: { five_hour: window(10), seven_day: window(20), ...extra },
});

describe('Claude quota windows', () => {
  it('includes every reported model window in overflow admission', () => {
    const windows = claudeWindows(
      usage({ model_scoped: [{ display_name: 'Fable', ...window(80) }], seven_day_opus: window(30) }),
    );

    expect(windows).toHaveLength(4);
    expect(windows[0].bucket).toBe('seven_day');
    expect(windows.find((item) => item.bucket === 'model:Fable')).toMatchObject({ used: 80, minutes: 10080 });
    expect(overflowAvailable({ used: { at: now, windows }, now })).toBe(false);
  });

  it('rejects incomplete or malformed plan data instead of dropping an unknown window', () => {
    expect(claudeWindows(usage({ five_hour: null }))).toEqual([]);
    expect(claudeWindows(usage({ seven_day: null }))).toEqual([]);
    expect(claudeWindows(usage({ model_scoped: [{ ...window(null), display_name: 'Fable' }] }))).toEqual([]);
    expect(claudeWindows(usage({ seven_day_opus: { utilization: 10, resets_at: 'unknown' } }))).toEqual([]);
    expect(claudeWindows({ ...usage(), rate_limits_available: false })).toEqual([]);
  });

  it('ignores unavailable optional windows and extra credit settings', () => {
    expect(claudeWindows(usage({ seven_day_opus: null, extra_usage: { utilization: 95 } }))).toHaveLength(2);
  });
});
