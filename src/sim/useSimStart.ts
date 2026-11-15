import { useCallback, useRef, useState } from 'react';
import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { useSimWorker } from './useSimWorker';
import type { SceneModelOptions } from './useSimulation';
import { errorMessage } from '../utils/errorMessage';
import { createStartupGate } from './startup';

interface SimStartInputs {
  sw: ReturnType<typeof useSimWorker>;
  buildModel: (options?: SceneModelOptions) => Promise<SimModel>;
  modelRef: React.RefObject<SimModel | null>;
  setModel: (model: SimModel | null) => void;
  controller: Controller;
  speed: number;
}

export function useSimStart({ sw, buildModel, modelRef, setModel, controller, speed }: SimStartInputs) {
  const { setError, setStatus, worker, load, cancelLoad, setPlaying } = sw;
  const pinned = useRef<string | null>(null);
  const [gate] = useState(createStartupGate);
  const cancel = useCallback(() => {
    gate.cancel();
    cancelLoad();
  }, [gate, cancelLoad]);
  const startModel = useCallback(
    async (given?: SimModel, current: () => boolean = () => true) => {
      if (!current()) return false;

      const token = gate.begin();
      const active = () => gate.current(token) && current();

      setError(null);
      setStatus('loading');

      try {
        const model = given ?? (await buildModel({ pin: pinned.current }));

        if (!active()) return false;

        modelRef.current = model;
        setModel(model);

        const target = worker();
        const loaded = await load(target, model, controller);

        if (!active()) return false;

        if (!loaded) {
          modelRef.current = null;
          setModel(null);

          return false;
        }

        target.postMessage({ type: 'speed', value: speed } satisfies SimRequest);
        target.postMessage({ type: 'play' } satisfies SimRequest);
        setPlaying(true);

        return true;
      } catch (error) {
        if (!active()) return false;

        modelRef.current = null;
        setModel(null);
        setError(errorMessage(error));
        setStatus('error');

        return false;
      }
    },
    [buildModel, worker, load, controller, speed, setError, setStatus, setPlaying, modelRef, setModel, gate],
  );
  const start = useCallback(
    async (given?: SimModel) => {
      pinned.current = null;
      await startModel(given);
    },
    [startModel],
  );
  const startGuarded = useCallback(
    (current: () => boolean) => {
      pinned.current = null;

      return startModel(undefined, current);
    },
    [startModel],
  );
  const startPinned = useCallback(
    async (pin: string | null, current?: () => boolean) => {
      pinned.current = pin;
      await startModel(undefined, current);
    },
    [startModel],
  );

  return {
    start,
    startGuarded,
    startPinned,
    cancel,
    cancelStart: cancel,
    subscribeStop: gate.subscribeStop,
    pinned: () => (modelRef.current ? pinned.current : null),
  };
}
