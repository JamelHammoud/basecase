import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SimModel } from './mjcfTypes';
import { useSimStart } from './useSimStart';
import { useSimWorker } from './useSimWorker';

const model = {} as SimModel;

function starter() {
  const postMessage = vi.fn();
  const sw = {
    setError: vi.fn(),
    setStatus: vi.fn(),
    worker: () => ({ postMessage }),
    load: vi.fn(async () => true),
    cancelLoad: vi.fn(),
    setPlaying: vi.fn(),
  };
  const buildModel = vi.fn(async () => model);
  const setModel = vi.fn();
  const modelRef = { current: null as SimModel | null };
  const result: { current?: ReturnType<typeof useSimStart> } = {};

  function Harness() {
    result.current = useSimStart({
      sw: sw as unknown as ReturnType<typeof useSimWorker>,
      buildModel,
      modelRef,
      setModel,
      controller: { kind: 'hold' },
      speed: 1,
    });

    return null;
  }

  renderToString(createElement(Harness));

  return { start: result.current!, sw, buildModel, setModel, modelRef, postMessage };
}

describe('simulation starts superseded by world changes', () => {
  it('does not load a model whose build completed after Stop', async () => {
    const { start, sw, setModel } = starter();
    const pending = start.start();

    start.cancelStart();
    await pending;
    expect(sw.cancelLoad).toHaveBeenCalledTimes(2);
    expect(setModel).not.toHaveBeenCalled();
    expect(sw.load).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });

  it('does not play a model whose worker load completed after Stop', async () => {
    const { start, sw, postMessage } = starter();
    const pending = start.start(model);

    await Promise.resolve();
    expect(sw.load).toHaveBeenCalledOnce();
    start.cancelStart();
    await pending;
    expect(postMessage).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });

  it('only plays the newest of two overlapping model loads', async () => {
    const { start, sw, postMessage } = starter();
    const first = start.start(model);
    const second = start.start({ ...model });

    await Promise.all([first, second]);
    expect(postMessage.mock.calls).toEqual([[{ type: 'speed', value: 1 }], [{ type: 'play' }]]);
    expect(sw.setPlaying).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('guarded simulation startup', () => {
  it('skips preparation after its owning Routine or Case was cancelled', async () => {
    const { start, sw, buildModel } = starter();

    expect(await start.startGuarded(() => false)).toBe(false);
    expect(buildModel).not.toHaveBeenCalled();
    expect(sw.setStatus).not.toHaveBeenCalled();
    expect(sw.load).not.toHaveBeenCalled();
  });

  it('notifies preparation owners when Stop happens before any model exists', () => {
    const { start } = starter();
    const stopped = vi.fn();
    const detach = start.subscribeStop(stopped);

    start.cancelStart();
    expect(stopped).toHaveBeenCalledOnce();
    detach();
    start.cancelStart();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('loads a supplied model without rebuilding scene geometry', async () => {
    const { start, buildModel, sw, modelRef } = starter();
    const supplied = { ...model };

    await start.start(supplied);
    expect(buildModel).not.toHaveBeenCalled();
    expect(sw.load).toHaveBeenCalledWith(expect.anything(), supplied, { kind: 'hold' });
    expect(modelRef.current).toBe(supplied);
  });

  it('releases the prepared model when a worker load fails', async () => {
    const { start, sw, modelRef, setModel, postMessage } = starter();

    sw.load.mockResolvedValueOnce(false);
    expect(await start.startGuarded()).toBe(false);
    expect(modelRef.current).toBeNull();
    expect(setModel).toHaveBeenLastCalledWith(null);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('rejects a live preparation invalidated while its worker was loading', async () => {
    const { start, sw, postMessage } = starter();
    let current = true;
    const pending = start.startGuarded(() => current);

    await Promise.resolve();
    expect(sw.load).toHaveBeenCalledOnce();
    current = false;
    expect(await pending).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });
});
