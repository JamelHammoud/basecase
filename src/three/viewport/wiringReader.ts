import { rememberWiring } from '../analysis/analysisPool';
import { cableAnalysisClient } from '../analysis/cableAnalysisClient';
import { wiringSnapshot } from './analysisSnapshots';
import type { ViewportContext } from './viewportContext';
import type { WiringScene } from '../../wiring/connectors';

export function wiringReader(ctx: ViewportContext, complete: () => void) {
  const client = cableAnalysisClient();

  return {
    query: (scene: WiringScene, signal?: AbortSignal) =>
      wiringSnapshot(
        scene,
        ctx,
        complete,
        signal
          ? async (shapes, input) => {
              const result = await client.run(shapes, input, signal);

              rememberWiring(shapes, input, result);

              return result;
            }
          : undefined,
      ),
    dispose: client.dispose,
  };
}
