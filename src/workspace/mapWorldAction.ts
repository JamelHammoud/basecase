import type { PreparedWorld } from '../cases/worldImportOps';
import { makeMapWorld } from '../dataLayers/mapClient';
import type { MapWorldRequest } from '../dataLayers/mapWorld';

export function mapWorldAction(
  request: MapWorldRequest | (() => Promise<PreparedWorld>),
  handlers: { ready: (prepared: PreparedWorld) => void; failed: (error: unknown) => void },
): () => void {
  let running = false;

  return () => {
    if (running) return;

    running = true;

    const pending = typeof request === 'function' ? request() : makeMapWorld(request);

    void pending.then(handlers.ready, handlers.failed).finally(() => {
      running = false;
    });
  };
}
