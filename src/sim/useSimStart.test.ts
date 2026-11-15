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

describe('simulation starts superseded by world changes', () => {
  it('notifies Stop subscribers and refuses a guarded startup after cancellation', async () => {
    const { start, sw, postMessage } = starter();
    const stopped = vi.fn();
    const detach = start.subscribeStop(stopped);
    const pending = start.startGuarded(() => true);

    start.cancel();
    await expect(pending).resolves.toBe(false);
    expect(stopped).toHaveBeenCalledOnce();
    expect(sw.load).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    detach();
    start.cancel();
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('refuses an obsolete external guard without building or loading', async () => {
    const { start, sw, buildModel } = starter();

    await expect(start.startGuarded(() => false)).resolves.toBe(false);
    expect(buildModel).not.toHaveBeenCalled();
    expect(sw.load).not.toHaveBeenCalled();
  });

  it('refuses a Case replaced while building its model', async () => {
    const { start, sw, buildModel, postMessage } = starter();
    let current = true;

    buildModel.mockImplementation(async () => {
      current = false;

      return model;
    });

    await expect(start.startGuarded(() => current)).resolves.toBe(false);
    expect(sw.load).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('refuses a Case replaced while its worker loads the model', async () => {
    const { start, sw, postMessage } = starter();
    let current = true;

    sw.load.mockImplementation(async () => {
      current = false;

      return true;
    });

    await expect(start.startGuarded(() => current)).resolves.toBe(false);
    expect(sw.load).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });

  it('does not load a model whose build completed after Stop', async () => {
    const { start, sw, setModel } = starter();
    const pending = start.start();

    start.cancel();
    await pending;
    expect(sw.cancelLoad).toHaveBeenCalledOnce();
    expect(setModel).not.toHaveBeenCalled();
    expect(sw.load).not.toHaveBeenCalled();
    expect(sw.setPlaying).not.toHaveBeenCalled();
  });

  it('does not play a model whose worker load completed after Stop', async () => {
    const { start, sw, postMessage } = starter();
    const pending = start.start(model);

    expect(sw.load).toHaveBeenCalledOnce();
    start.cancel();
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
