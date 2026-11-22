import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: new Map(), held: new Set(), execute: vi.fn() }));

vi.mock('./claim.mjs', () => ({
  claim: (key) => {
    if (state.held.has(key)) return null;

    state.held.add(key);

    return () => state.held.delete(key);
  },
}));
vi.mock('./store.mjs', () => ({
  store: () => ({
    get: (key) => structuredClone(state.values.get(key) ?? { at: 0, windows: [], baseline: null }),
    save: (key, value) => {
      state.values.set(key, structuredClone(value));

      return value;
    },
  }),
}));
vi.mock('./sh.mjs', () => ({ run: state.execute }));

const { reserveOverflow, quotaSnapshot } = await import('./quota.mjs');
const now = Date.UTC(2026, 10, 22, 18);
const reset = now + 3 * 24 * 60 * 60_000;
const snapshot = (used = 4) => ({
  at: now,
  windows: [{ bucket: 'seven_day', used, minutes: 10080, reset }],
  baseline: { used: 2, reset },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  state.values.clear();
  state.held.clear();
  state.execute.mockImplementation(() => ({ ok: true, out: JSON.stringify(snapshot()), err: '' }));
});
afterEach(() => vi.useRealTimers());

it('uses the fresh shared snapshot for admission and refreshes after a session finishes', () => {
  state.values.set('claude', snapshot());

  const release = reserveOverflow();

  expect(release).toBeTypeOf('function');
  expect(state.execute).not.toHaveBeenCalled();
  expect(reserveOverflow()).toBeNull();
  release();
  expect(state.execute).toHaveBeenCalledOnce();
  expect(state.held.size).toBe(0);
});

it('bounds repeated missing-data probes to one per minute and remains closed until fresh data arrives', () => {
  state.execute.mockReturnValueOnce({ ok: true, out: JSON.stringify({ at: now, windows: [] }) });

  for (let i = 0; i < 8; i++) expect(reserveOverflow()).toBeNull();

  expect(state.execute).toHaveBeenCalledOnce();
  expect(state.held.size).toBe(0);
  vi.advanceTimersByTime(60_000);
  state.execute.mockReturnValueOnce({ ok: true, out: JSON.stringify({ ...snapshot(), at: now + 60_000 }) });

  const release = reserveOverflow();

  expect(release).toBeTypeOf('function');
  expect(state.execute).toHaveBeenCalledTimes(2);
  release();
});

it('refreshes an expired snapshot before admitting a session', () => {
  state.values.set('claude', { ...snapshot(), at: now - 60_001 });

  const release = reserveOverflow();

  expect(release).toBeTypeOf('function');
  expect(state.execute).toHaveBeenCalledOnce();
  release();
  expect(state.execute).toHaveBeenCalledTimes(2);
});

it.each([
  { used: 80, baseline: 2 },
  { used: 7, baseline: 2 },
])('preserves the protected usage boundary at %j', ({ used, baseline }) => {
  state.values.set('claude', { ...snapshot(used), baseline: { used: baseline, reset } });
  expect(reserveOverflow()).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.held.size).toBe(0);
});

it('preserves a blocked model-scoped window', () => {
  const value = snapshot();

  value.windows.push({ bucket: 'scoped', used: 80, minutes: 10080, reset });
  state.values.set('claude', value);
  expect(reserveOverflow()).toBeNull();
  expect(state.held.size).toBe(0);
});

it('retains a verified measurement after an empty response without renewing its age', () => {
  state.values.set('claude', { ...snapshot(), at: now - 90_000 });
  state.execute.mockReturnValue({ ok: true, out: JSON.stringify({ at: now, windows: [] }) });

  const value = quotaSnapshot('claude');

  expect(value.at).toBe(now - 90_000);
  expect(value.windows).toEqual(snapshot().windows);
  expect(value.baseline).toEqual(snapshot().baseline);
  expect(quotaSnapshot('claude')).toEqual(value);
  expect(state.execute).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(5 * 60_000);
  expect(reserveOverflow()).toBeNull();
  expect(state.held.size).toBe(0);
});

it.each([
  { ok: false, out: '' },
  { ok: true, out: 'malformed' },
])('bounds failed provider probes with no usable measurement at %j', (response) => {
  state.execute.mockReturnValue(response);

  for (let index = 0; index < 8; index++) expect(reserveOverflow()).toBeNull();

  expect(state.execute).toHaveBeenCalledOnce();
  expect(state.held.size).toBe(0);
  vi.advanceTimersByTime(60_000);
  expect(reserveOverflow()).toBeNull();
  expect(state.execute).toHaveBeenCalledTimes(2);
});
