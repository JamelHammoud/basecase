import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entries: [],
  deliver: vi.fn(),
  close: vi.fn(),
  claim: vi.fn(),
}));

vi.mock('../lib/deliver.mjs', () => ({ deliver: mocks.deliver }));
vi.mock('../lib/deliveryState.mjs', () => ({ pendingDeliveries: () => mocks.entries }));
vi.mock('../lib/worktree.mjs', () => ({ close: mocks.close }));
vi.mock('../lib/claim.mjs', () => ({ claim: mocks.claim }));

const { default: delivery } = await import('./delivery.mjs');

afterEach(() => vi.resetAllMocks());

describe('delivery lane', () => {
  it('delivers later entries after an earlier failure without deleting failed work', () => {
    const release = vi.fn();
    const first = { branch: 'loop/build/1', number: 1 };
    const second = { branch: 'loop/build/2', number: 2 };

    mocks.entries = [first, second];
    mocks.claim.mockReturnValue(release);
    mocks.deliver.mockImplementationOnce(() => {
      throw new Error('push rejected');
    });
    mocks.deliver.mockReturnValueOnce('https://example.com/pull/2');

    delivery({ log: vi.fn() });

    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    expect(mocks.close).toHaveBeenCalledExactlyOnceWith(second);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('leaves an active revision alone until its pull claim is released', () => {
    mocks.entries = [{ branch: 'loop/build/1', number: 1 }];
    mocks.claim.mockReturnValue(null);

    delivery({ log: vi.fn() });

    expect(mocks.claim).toHaveBeenCalledWith('pull-1');
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
