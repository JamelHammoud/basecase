import type { Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { SimRequest, SimResponse } from './sim.worker';

export class SimLoads {
  private waiter: { id: number; resolve: (loaded: boolean) => void } | null = null;
  private count = 0;

  readonly cancel = () => {
    this.waiter?.resolve(false);
    this.waiter = null;
  };

  readonly ready = () => {
    this.waiter?.resolve(true);
    this.waiter = null;
  };

  readonly stale = (msg: SimResponse) =>
    (msg.type === 'ready' || msg.type === 'error') && msg.loadId !== undefined && msg.loadId !== this.waiter?.id;

  readonly load = (worker: Worker, model: SimModel, controller: Controller) =>
    new Promise<boolean>((resolve) => {
      this.cancel();

      const id = ++this.count;

      this.waiter = { id, resolve };
      worker.postMessage({ type: 'load', model, controller, loadId: id } satisfies SimRequest);
    });
}
