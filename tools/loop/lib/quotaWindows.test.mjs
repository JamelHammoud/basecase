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
  const currentUsage = (percent = 4) =>
    usage({
      five_hour: null,
      limits: [
        { kind: 'weekly_all', group: 'weekly', percent: 2, resets_at: reset, is_active: false },
        {
          kind: 'weekly_scoped',
          group: 'weekly',
          percent,
          resets_at: reset,
          is_active: true,
          scope: { model: { display_name: 'Fable' } },
        },
      ],
      spend: { enabled: false, percent: 0 },
    });

  it('admits the current weekly-only subscription response while preserving every model limit', () => {
    const windows = claudeWindows(currentUsage());

    expect(windows).toEqual([
      { bucket: 'seven_day', used: 2, minutes: 10080, reset: Date.parse(reset) },
      { bucket: 'weekly_scoped:Fable', used: 4, minutes: 10080, reset: Date.parse(reset) },
    ]);
    expect(overflowAvailable({ used: { at: now, windows }, now })).toBe(true);
    expect(overflowAvailable({ used: { at: now, windows: claudeWindows(currentUsage(80)) }, now })).toBe(false);
  });

  it.each([null, [], [{ kind: 'weekly_scoped', group: 'weekly', percent: 4, resets_at: reset }]])(
    'refuses incomplete current limits: %j',
    (limits) => expect(claudeWindows(usage({ limits }))).toEqual([]),
  );

  it('keeps one overflow budget when the provider changes reset timestamp fractions', () => {
    const first = currentUsage();
    const second = currentUsage();

    first.rate_limits.limits[0].resets_at = reset.replace('.000Z', '.321492Z');
    second.rate_limits.limits[0].resets_at = reset.replace('.000Z', '.225000Z');

    const baseline = { used: 2, reset: claudeWindows(first)[0].reset };
    const windows = claudeWindows(second).map((item) => ({ ...item, used: 7 }));

    expect(overflowAvailable({ used: { at: now, windows }, baseline, now })).toBe(false);
  });

  it.each([{ group: 'unknown' }, { percent: null }, { percent: 101 }, { resets_at: null }])(
    'refuses a malformed current model limit: %j',
    (change) => {
      const response = currentUsage();

      Object.assign(response.rate_limits.limits[1], change);
      expect(claudeWindows(response)).toEqual([]);
    },
  );

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
