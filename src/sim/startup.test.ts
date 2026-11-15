import { describe, expect, it, vi } from 'vitest';
import { createStartupGate, prepareStartup } from './startup';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('simulation startup cancellation', () => {
  it('notifies Stop even before a simulation is loaded and rejects an obsolete build', async () => {
    const gate = createStartupGate();
    const stopped = vi.fn();
    const build = deferred<string>();
    const load = vi.fn(async () => true);
    const prepared = vi.fn();
    const token = gate.begin();
    const detach = gate.subscribeStop(stopped);
    const run = prepareStartup({ build: () => build.promise, load, prepared, current: () => gate.current(token) });

    gate.cancel();
    build.resolve('old model');
    expect(await run).toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(prepared).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    detach();
    gate.cancel();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('keeps a cancelled model load from playing and allows its replacement', async () => {
    const gate = createStartupGate();
    const loading = deferred<boolean>();
    const token = gate.begin();
    const prepared = vi.fn();
    const run = prepareStartup({
      build: async () => 'first',
      load: () => loading.promise,
      prepared,
      current: () => gate.current(token),
    });

    await Promise.resolve();
    gate.cancel();
    loading.resolve(true);
    expect(await run).toBe(false);

    const next = gate.begin();

    expect(
      await prepareStartup({
        build: async () => 'second',
        load: async () => true,
        prepared,
        current: () => gate.current(next),
      }),
    ).toBe(true);
    expect(prepared.mock.calls).toEqual([['first'], ['second']]);
  });
});
