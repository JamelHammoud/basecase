import { useCallback, useRef } from 'react';
import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest } from './sim.worker';
import type { useSimWorker } from './useSimWorker';
import type { SceneModelOptions } from './useSimulation';
import { errorMessage } from '../utils/errorMessage';

interface SimStartInputs {
  sw: ReturnType<typeof useSimWorker>;
  buildModel: (options?: SceneModelOptions) => Promise<SimModel>;
  modelRef: React.RefObject<SimModel | null>;
  setModel: (m: SimModel) => void;
  controller: Controller;
  speed: number;
}

export function useSimStart({ sw, buildModel, modelRef, setModel, controller, speed }: SimStartInputs) {
  const { setError, setStatus, worker, load, cancelLoad, setPlaying } = sw;
  const pinned = useRef<string | null>(null);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current++;
    cancelLoad();
  }, [cancelLoad]);

  const startModel = useCallback(
    async (given?: SimModel) => {
      const ticket = ++generation.current;

      setError(null);
      setStatus('loading');

      let m: SimModel;

      try {
        m = given ?? (await buildModel({ pin: pinned.current }));
      } catch (e) {
        if (ticket !== generation.current) return;

        setError(errorMessage(e));
        setStatus('error');

        return;
      }

      if (ticket !== generation.current) return;

      modelRef.current = m;
      setModel(m);

      const w = worker();
      const loaded = await load(w, m, controller);

      if (!loaded || ticket !== generation.current) return;

      w.postMessage({ type: 'speed', value: speed } satisfies SimRequest);
      w.postMessage({ type: 'play' } satisfies SimRequest);
      setPlaying(true);
    },
    [buildModel, worker, load, controller, speed, setError, setStatus, setPlaying, modelRef, setModel],
  );

  const start = useCallback(
    (given?: SimModel) => {
      pinned.current = null;

      return startModel(given);
    },
    [startModel],
  );

  const startPinned = useCallback(
    (pin: string | null) => {
      pinned.current = pin;

      return startModel();
    },
    [startModel],
  );

  return { start, startPinned, cancel, pinned: () => (modelRef.current ? pinned.current : null) };
}
