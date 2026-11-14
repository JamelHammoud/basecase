import { useCallback, useEffect, useRef } from 'react';
import { compactDepth } from '../routines/visionDepth';
import type { VisionResult } from '../vision/protocol';
import { onVisionResults, visionResults } from '../vision/resultStore';
import type { SimRequest } from './sim.worker';
import { VisionLink } from './visionLink';

export function useVisionLink(workerRef: React.RefObject<Worker | null>, setError: (message: string) => void) {
  const link = useRef(new VisionLink());
  const send = useCallback(
    (msg: SimRequest) => {
      if (msg.type === 'case' && msg.plan) {
        void link.current
          .start(msg.plan)
          .then((started) => {
            if (started) workerRef.current?.postMessage(msg);
          })
          .catch((reason: unknown) => setError(String(reason)));

        return;
      }

      if (msg.type === 'caseEnd' || msg.type === 'dispose') link.current.stop();

      workerRef.current?.postMessage(msg);
    },
    [setError, workerRef],
  );

  useEffect(() => {
    const sent = new WeakSet<VisionResult>();

    return onVisionResults(() => {
      const now = performance.timeOrigin + performance.now();

      for (const result of visionResults()) {
        if (sent.has(result) || result.mediaTime !== undefined) continue;

        sent.add(result);
        workerRef.current?.postMessage({
          type: 'vision',
          result: { ...result, depth: compactDepth(result.depth) },
          ageMs: Math.max(0, now - result.timestamp),
        } satisfies SimRequest);
      }
    });
  }, [workerRef]);
  useEffect(() => () => link.current.stop(), []);

  return { link, send };
}
