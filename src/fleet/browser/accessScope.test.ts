import { afterEach, expect, it, vi } from 'vitest';
import { accessScope } from './accessScope';

afterEach(() => vi.unstubAllGlobals());

it('rejects late replies and prevents writes after navigation or administrative denial', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const denied = vi.fn();

  vi.stubGlobal('fetch', fetcher);

  const scope = accessScope(denied);
  const pending = scope.request('org/role');

  scope.close();
  finish(Response.json({ items: ['obsolete'] }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(scope.request('org/role', { method: 'POST' })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(denied).not.toHaveBeenCalled();

  fetcher.mockImplementation(async () => Response.json({}, { status: 403 }));

  const current = accessScope(denied);

  await expect(current.request('org/account')).rejects.toThrow();
  await expect(current.request('org/account', { method: 'PUT' })).rejects.toMatchObject({ name: 'AbortError' });
  expect(denied).toHaveBeenCalledOnce();
});

it('preserves the ability to correct validation failures and stops on revoked sessions', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ id: 'saved' }))
    .mockResolvedValueOnce(Response.json({}, { status: 401 }));
  const denied = vi.fn();

  vi.stubGlobal('fetch', fetcher);

  const scope = accessScope(denied);

  await expect(scope.request('org/role', { method: 'POST' })).rejects.toThrow();
  expect(denied).not.toHaveBeenCalled();
  await expect(scope.request('org/role', { method: 'POST' })).resolves.toEqual({ id: 'saved' });
  await expect(scope.request('org/role')).rejects.toThrow();
  expect(denied).toHaveBeenCalledOnce();
});
