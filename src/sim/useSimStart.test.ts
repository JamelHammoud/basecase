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
  const result: { current?: ReturnType<typeof useSimStart> } = {};

  function Harness() {
    result.current = useSimStart({
      sw: sw as unknown as ReturnType<typeof useSimWorker>,
      buildModel,
      modelRef: { current: null },
      setModel,
      controller: { kind: 'hold' },
      speed: 1,
    });

    return null;
  }

  renderToString(createElement(Harness));

  return { start: result.current!, sw, buildModel, setModel, postMessage };
}

describe('simulation startup and replay models', () => {
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

  it('loads the supplied replay model without rebuilding the scene', async () => {
    const { start, sw, buildModel, setModel, postMessage } = starter();
    const replay = { xml: 'seeded' } as SimModel;

    await start.start(replay);
    expect(buildModel).not.toHaveBeenCalled();
    expect(setModel).toHaveBeenCalledExactlyOnceWith(replay);
    expect(sw.load).toHaveBeenCalledWith(expect.anything(), replay, { kind: 'hold' });
    expect(postMessage.mock.calls).toEqual([[{ type: 'speed', value: 1 }], [{ type: 'play' }]]);
  });

  it('notifies a pending Routine on Stop and rejects its obsolete startup', async () => {
    const { start, sw } = starter();
    const stopped = vi.fn();
    const detach = start.subscribeStop(stopped);
    const pending = start.startGuarded();

    start.cancelStart();
    expect(await pending).toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(sw.load).not.toHaveBeenCalled();
    detach();
    start.cancelStart();
    expect(stopped).toHaveBeenCalledOnce();
    expect(await start.startGuarded()).toBe(true);
    expect(sw.setPlaying).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does not start a Routine whose scene guard has expired', async () => {
    const { start, sw, buildModel } = starter();

    expect(await start.startGuarded(() => false)).toBe(false);
    expect(buildModel).not.toHaveBeenCalled();
    expect(sw.load).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });
});
