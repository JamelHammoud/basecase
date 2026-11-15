import { useCallback, useEffect, useRef, useState } from 'react';
import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { SceneModelOptions } from './useSimulation';
import type { useSimWorker } from './useSimWorker';
import { errorMessage } from '../utils/errorMessage';
import { createStartupGate, prepareStartup } from './startup';

interface SimStartInputs {
  sw: ReturnType<typeof useSimWorker>;
  buildModel: (options?: SceneModelOptions) => Promise<SimModel>;
  modelRef: React.RefObject<SimModel | null>;
  setModel: (model: SimModel | null) => void;
  controller: Controller;
  speed: number;
}

export function useSimStart({ sw, buildModel, modelRef, setModel, controller, speed }: SimStartInputs) {
  const { setError, setStatus, worker, load, setPlaying, cancelLoad } = sw;
  const pinned = useRef<string | null>(null);
  const [gate] = useState(createStartupGate);

  useEffect(
    () => () => {
      gate.cancel();
      cancelLoad();
    },
    [gate, cancelLoad],
  );

  const startModel = useCallback(
    async (current: () => boolean = () => true, given?: SimModel) => {
      if (!current()) return false;

      const token = gate.begin();
      const active = () => gate.current(token) && current();

      cancelLoad();
      setError(null);
      setStatus('loading');

      try {
        const ready = await prepareStartup({
          build: () => (given ? Promise.resolve(given) : buildModel({ pin: pinned.current })),
          prepared: (model) => {
            modelRef.current = model;
            setModel(model);
          },
          load: (model) => load(worker(), model, controller),
          current: active,
        });

        if (!active()) return false;

        if (!ready) {
          modelRef.current = null;
          setModel(null);

          return false;
        }

        const target = worker();

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
    [
      buildModel,
      worker,
      load,
      controller,
      speed,
      setError,
      setStatus,
      setPlaying,
      modelRef,
      setModel,
      gate,
      cancelLoad,
    ],
  );
  const startGuarded = useCallback(
    (current?: () => boolean) => {
      pinned.current = null;

      return startModel(current);
    },
    [startModel],
  );
  const start = useCallback(
    async (given?: SimModel) => {
      pinned.current = null;
      await startModel(undefined, given);
    },
    [startModel],
  );
  const startPinned = useCallback(
    async (pin: string | null, current?: () => boolean) => {
      pinned.current = pin;

      await startModel(current);
    },
    [startModel],
  );
  const cancelStart = useCallback(() => {
    gate.cancel();
    cancelLoad();
  }, [gate, cancelLoad]);

  return {
    start,
    startGuarded,
    startPinned,
    cancelStart,
    subscribeStop: gate.subscribeStop,
    pinned: () => (modelRef.current ? pinned.current : null),
  };
}
