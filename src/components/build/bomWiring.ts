import type { Netlist, WiringScene } from '../../wiring/netlist';
import { errorMessage } from '../../utils/errorMessage';

interface WiringResult {
  scene: WiringScene;
  wiring?: Netlist;
  error?: string;
}

export const sameWiringScene = (before: WiringScene, after: WiringScene) =>
  before.parts === after.parts &&
  before.project.joints === after.project.joints &&
  before.project.wiring === after.project.wiring &&
  before.project.extras === after.project.extras &&
  before.project.tether === after.project.tether &&
  before.project.sourced === after.project.sourced;

export const wiringForScene = (result: WiringResult | null, scene: WiringScene) =>
  result && sameWiringScene(result.scene, scene) ? result.wiring : undefined;

export function bomWiring() {
  let result: WiringResult | null = null;
  let turn = 0;
  let active: { scene: WiringScene; abort: AbortController; promise: Promise<Netlist> } | null = null;
  const stop = () => {
    active?.abort.abort();
    active = null;
  };
  const listeners = new Set<() => void>();
  const publish = (next: WiringResult, run: number) => {
    if (run !== turn) return;

    if (next.error && result?.error === next.error && sameWiringScene(result.scene, next.scene)) return;

    result = next;
    listeners.forEach((listener) => listener());
  };

  return {
    snapshot: () => result,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    dispose: () => {
      turn++;
      stop();
    },
    load: (scene: WiringScene, query: (scene: WiringScene, signal: AbortSignal) => Promise<Netlist>) => {
      const run = ++turn;

      if (active && !sameWiringScene(active.scene, scene)) stop();

      if (wiringForScene(result, scene))
        return () => {
          if (run === turn) turn++;
        };

      const abort = active?.abort ?? new AbortController();
      const promise = active?.promise ?? query(scene, abort.signal);
      const request = { scene, abort, promise };
      const finish = () => {
        if (active === request) active = null;
      };

      active = request;
      void promise.then(
        (wiring) => {
          finish();
          publish({ scene, wiring }, run);
        },
        (error: unknown) => {
          finish();
          publish({ scene, error: errorMessage(error) }, run);
        },
      );

      return () => {
        if (run === turn) turn++;
      };
    },
  };
}
