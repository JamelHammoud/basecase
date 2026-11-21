import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAccessPage } from './useAccessPage';
import { useAccessRequest } from './accessSession';

const state = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('react', () => ({ useEffect: vi.fn(), useState: () => [null, state.set] }));
vi.mock('./accessSession', () => ({ useAccessRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('discards a page after an organization, page or selected resource change and bounds retained rows', async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const request = vi.fn().mockReturnValue(pending);

  vi.mocked(useAccessRequest).mockReturnValue(request);

  expect(useAccessPage('org/role')).toEqual({ page: { items: [], next: null }, busy: true, error: '' });

  const cleanup = vi.mocked(useEffect).mock.calls[0][0]();

  cleanup?.();
  finish({ items: [{ id: 'obsolete' }], next: 'after' });
  await pending;
  await Promise.resolve();
  expect(state.set).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
