import { useCallback, useRef } from 'react';
import type { Recording } from './recorder';
import type { SimRequest, SimResponse } from './sim.worker';
import type { ScrubbedTake, Take } from './takeRecording';

export type RecordingReply = Extract<SimResponse, { type: 'recorded' | 'scrubbed' | 'sought' }>;

type Scrubbed = Extract<SimResponse, { type: 'scrubbed' }>;

export interface Sought {
  frame: number;
  qpos: Float64Array;
}

export function useRecordingLink(workerRef: React.RefObject<Worker | null>) {
  const recordWaiter = useRef<((r: Recording | null) => void) | null>(null);
  const waiter = useRef<((scrubbed: Scrubbed | null) => void) | null>(null);
  const sought = useRef<Sought | null>(null);

  const reply = useCallback((msg: RecordingReply) => {
    if (msg.type === 'recorded') {
      recordWaiter.current?.(msg.recording);
      recordWaiter.current = null;

      return;
    }

    if (msg.type === 'sought') {
      sought.current = { frame: msg.frame, qpos: msg.qpos };

      return;
    }

    waiter.current?.(msg);
    waiter.current = null;
  }, []);

  const request = useCallback(
    (msg: Extract<SimRequest, { type: 'scrub' | 'scrubTake' }>) =>
      new Promise<Scrubbed | null>((resolve) => {
        const w = workerRef.current;

        sought.current = null;
        waiter.current?.(null);
        waiter.current = null;

        if (!w) {
          resolve(null);

          return;
        }

        waiter.current = resolve;
        w.postMessage(msg);
      }),
    [workerRef],
  );

  const scrub = useCallback(
    async (recording: Recording | null) => (await request({ type: 'scrub', recording }))?.efforts ?? null,
    [request],
  );

  const scrubTake = useCallback(
    async (take: Take): Promise<ScrubbedTake | null> => {
      const scrubbed = await request({ type: 'scrubTake', take });

      return scrubbed?.recording && scrubbed.efforts
        ? { recording: scrubbed.recording, efforts: scrubbed.efforts }
        : null;
    },
    [request],
  );

  const seek = useCallback(
    (frame: number) => workerRef.current?.postMessage({ type: 'seek', frame } satisfies SimRequest),
    [workerRef],
  );

  const stopRecording = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        if (!workerRef.current) {
          resolve(null);

          return;
        }

        recordWaiter.current = resolve;
        workerRef.current.postMessage({ type: 'record', on: false } satisfies SimRequest);
      }),
    [workerRef],
  );

  return { reply, stopRecording, scrub, scrubTake, seek, sought: useCallback(() => sought.current, []) };
}
