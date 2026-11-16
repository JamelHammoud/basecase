import { afterEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ claimWithin: vi.fn(), release: vi.fn() }));

vi.mock('./claim.mjs', () => ({ claimWithin: calls.claimWithin }));

const { fetchGit } = await import('./gitFetch.mjs');

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Git fetch timeout budget', () => {
  it('bounds claim acquisition and gives Git only the remaining time', () => {
    const execute = vi.fn(() => ({ ok: true }));

    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1060);
    calls.claimWithin.mockReturnValue(calls.release);
    fetchGit(['origin'], { cwd: '/checkout', timeout: 100 }, execute);

    expect(calls.claimWithin).toHaveBeenCalledWith('git-fetch', { ms: 100, every: 25 });
    expect(execute).toHaveBeenCalledWith('git', ['fetch', 'origin'], { cwd: '/checkout', timeout: 40 });
    expect(calls.release).toHaveBeenCalledOnce();
  });

  it.each([false, true])('does not start Git after the budget expires with allowFail=%s', (allowFail) => {
    const execute = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1100);
    calls.claimWithin.mockReturnValue(calls.release);

    const fetch = () => fetchGit(['origin'], { timeout: 100, allowFail }, execute);

    if (allowFail) expect(fetch()).toMatchObject({ ok: false, err: expect.stringContaining('timed out') });

    if (!allowFail) expect(fetch).toThrow('timed out');

    expect(execute).not.toHaveBeenCalled();
    expect(calls.release).toHaveBeenCalledOnce();
  });
});
