import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fleetRequest, type RegistryPage } from './client';
import { useInventory } from './useInventory';

const setters = vi.hoisted(() => [] as ReturnType<typeof vi.fn>[]);

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const set = vi.fn();

    setters.push(set);

    return [initial, set];
  },
}));
vi.mock('./client', () => ({ fleetRequest: vi.fn() }));

class Subscription {
  static readonly instances: Subscription[] = [];
  listeners = new Map<string, () => void>();
  close = vi.fn();
  onerror: (() => void) | null = null;

  constructor() {
    Subscription.instances.push(this);
  }

  addEventListener(name: string, handler: () => void) {
    this.listeners.set(name, handler);
  }
}

const page: RegistryPage = {
  items: [{ id: 'robot', name: 'Delivery 01', parent: 'ward', status: 'online', observedAt: null, stale: true }],
  next: null,
};

beforeEach(() => {
  setters.length = 0;
  Subscription.instances.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', Subscription);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['reset', 'error'])('keeps inventory cleared after a stream %s and late responses', async (event) => {
  let resolve!: (value: RegistryPage) => void;
  const pending = new Promise<RegistryPage>((complete) => {
    resolve = complete;
  });

  vi.mocked(fleetRequest).mockReturnValue(pending);
  useInventory('organization');

  const [load, subscribe] = vi.mocked(useEffect).mock.calls.map(([effect]) => effect);
  const cleanupLoad = load();
  const cleanupStream = subscribe();
  const stream = Subscription.instances[0];

  if (event === 'error') stream.onerror?.();
  else stream.listeners.get('reset')?.();

  const beforeLateResponse = setters.map((setter) => setter.mock.calls.length);

  resolve(page);
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  load();
  expect(fleetRequest).toHaveBeenCalledTimes(2);
  expect(setters.map((setter) => setter.mock.calls.length)).toEqual(beforeLateResponse);
  expect(setters[0]).toHaveBeenLastCalledWith({ items: [], next: null });
  expect(setters[1]).toHaveBeenLastCalledWith({ items: [], next: null });
  expect(stream.close).toHaveBeenCalledOnce();
  cleanupLoad?.();
  cleanupStream?.();
});

it('clears previously loaded rows when an inventory request fails and blocks later refreshes', async () => {
  vi.mocked(fleetRequest).mockResolvedValue(page);
  useInventory('organization');

  const load = vi.mocked(useEffect).mock.calls[0][0];

  load();
  await vi.waitFor(() => expect(setters[1]).toHaveBeenLastCalledWith(page));
  vi.mocked(fleetRequest).mockRejectedValue(new Error('Connection closed'));
  load();
  await vi.waitFor(() => expect(setters[1]).toHaveBeenLastCalledWith({ items: [], next: null }));
  load();
  expect(fleetRequest).toHaveBeenCalledTimes(4);
});
