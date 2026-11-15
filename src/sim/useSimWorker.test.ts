import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { createVisionScope, VisionScopeContext } from '../cameras/visionScope';
import type { SimModel } from './mjcfTypes';
import { useSimWorker } from './useSimWorker';

class FailedWorker {
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

afterEach(() => vi.unstubAllGlobals());

it('settles a model startup when its simulation worker crashes', async () => {
  vi.stubGlobal('Worker', FailedWorker);

  let session: ReturnType<typeof useSimWorker> | undefined;

  function Harness() {
    session = useSimWorker({ current: null }, { current: null });

    return null;
  }

  renderToString(
    createElement(VisionScopeContext, { value: createVisionScope('worker-crash') }, createElement(Harness)),
  );

  const worker = session!.worker();
  const pending = session!.load(worker, {} as SimModel, { kind: 'hold' });
  let loaded: boolean | undefined;

  void pending.then((value) => {
    loaded = value;
  });

  worker.onerror?.call(worker, { message: 'Simulator crashed' } as ErrorEvent);
  await Promise.resolve();
  expect(loaded).toBe(false);
});
