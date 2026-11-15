import type { Controller } from './engine';
import type { SimModel } from './mjcf';
import type { SimRequest } from './sim.worker';

export function createModelLoadLink() {
  let sequence = 0;
  let pending: { id: number; finish: (loaded: boolean) => void } | null = null;
  const cancel = () => {
    pending?.finish(false);
    pending = null;
  };

  return {
    cancel,
    ready: (id: number | undefined) => {
      if (!pending || pending.id !== id) return false;

      pending.finish(true);
      pending = null;

      return true;
    },
    load: (worker: { postMessage: (message: SimRequest) => void }, model: SimModel, controller: Controller) => {
      cancel();

      const loadId = ++sequence;

      return new Promise<boolean>((finish) => {
        pending = { id: loadId, finish };
        worker.postMessage({ type: 'load', model, controller, loadId });
      });
    },
  };
}
