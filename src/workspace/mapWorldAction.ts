import type { PreparedWorld } from '../cases/worldImportOps';
import { makeMapWorld } from '../dataLayers/mapClient';
import type { MapWorldRequest } from '../dataLayers/mapWorld';

export function mapWorldAction(
  request: MapWorldRequest,
  handlers: { ready: (prepared: PreparedWorld) => void; failed: (error: unknown) => void },
): () => void {
  let running = false;

  return () => {
    if (running) return;

    running = true;
    void makeMapWorld(request)
      .then(handlers.ready, handlers.failed)
      .finally(() => {
        running = false;
      });
  };
}
