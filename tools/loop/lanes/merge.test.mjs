import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pulls: [],
  pending: new Set(),
  merge: vi.fn(() => ({ ok: true })),
  closeSteps: vi.fn(),
}));

vi.mock('../lib/github.mjs', () => ({
  hasLabel: () => false,
  isPaused: () => false,
  mergePull: mocks.merge,
  openPulls: () => mocks.pulls,
  pullCheck: () => 'success',
  pullReview: () => 'success',
}));
vi.mock('../lib/deliveryState.mjs', () => ({ hasPendingDelivery: (branch) => mocks.pending.has(branch) }));
vi.mock('../lib/stepClosure.mjs', () => ({ closePullSteps: mocks.closeSteps }));

const { default: merge } = await import('./merge.mjs');

afterEach(() => vi.clearAllMocks());

describe('pending revisions', () => {
  it('keeps the old green head open until its prepared revision is delivered', () => {
    const pending = { number: 1, title: 'Feature: One', headRefName: 'loop/build/one' };
    const ready = { number: 2, title: 'Feature: Two', headRefName: 'loop/build/two' };

    mocks.pulls = [pending, ready];
    mocks.pending = new Set([pending.headRefName]);
    merge({ log: vi.fn() });

    expect(mocks.merge).toHaveBeenCalledExactlyOnceWith(2, 'squash');
    expect(mocks.closeSteps).toHaveBeenCalledTimes(1);

    mocks.pending.clear();
    mocks.pulls = [pending];
    merge({ log: vi.fn() });

    expect(mocks.merge).toHaveBeenLastCalledWith(1, 'squash');
  });
});
