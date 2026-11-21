import { useCallback, useRef, useState } from 'react';
import type { RecordedEfforts } from './recordedFrames';
import type { Recording } from './recorder';
import type { Case } from '../cases/schema';
import type { ContinuationPoint, ContinuationTakeover } from './continuationSession';
import type { SimRequest, SimResponse } from './sim.worker';

export type RecordingReply = Extract<SimResponse, { type: 'recorded' | 'scrubbed' | 'sought' | 'branched' }>;

export interface Sought {
  frame: number;
  qpos: Float64Array;
}

export function useRecordingLink(workerRef: React.RefObject<Worker | null>) {
  const recordWaiter = useRef<((r: Recording | null) => void) | null>(null);
  const waiter = useRef<((efforts: RecordedEfforts | null) => void) | null>(null);
  const sought = useRef<Sought | null>(null);
  const [points, setPoints] = useState<ContinuationPoint[]>([]);
  const selection = useRef(0);
  const branchId = useRef(0);
  const branchWaiter = useRef<((result: ContinuationTakeover | null) => void) | null>(null);

  const reply = useCallback((msg: RecordingReply) => {
    if (msg.type === 'branched' && msg.id !== branchId.current) return;

    if (msg.type === 'branched') {
      branchWaiter.current?.(msg.result);
      branchWaiter.current = null;

      return;
    }

    if (msg.type === 'recorded') {
      recordWaiter.current?.(msg.recording);
      recordWaiter.current = null;

      return;
    }

    if (msg.type === 'sought') {
      sought.current = { frame: msg.frame, qpos: msg.qpos };

      return;
    }

    selection.current = msg.selection ?? 0;
    setPoints(msg.checkpoints ?? []);
    waiter.current?.(msg.efforts);
    waiter.current = null;
  }, []);

  const scrub = useCallback(
    (recording: Recording | null, efforts?: RecordedEfforts) =>
      new Promise<RecordedEfforts | null>((resolve) => {
        const w = workerRef.current;

        sought.current = null;
        setPoints([]);
        branchId.current++;
        branchWaiter.current?.(null);
        branchWaiter.current = null;
        waiter.current?.(null);
        waiter.current = null;

        if (!w) {
          resolve(null);

          return;
        }

        waiter.current = resolve;
        w.postMessage({ type: 'scrub', recording, efforts } satisfies SimRequest);
      }),
    [workerRef],
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

  const branch = (frame: number, kase: Case, bytes?: Uint8Array) =>
    new Promise<ContinuationTakeover | null>((resolve) => {
      branchWaiter.current?.(null);
      branchId.current++;

      if (!workerRef.current || !selection.current) return resolve(null);

      branchWaiter.current = resolve;
      workerRef.current.postMessage({
        type: 'branch',
        id: branchId.current,
        selection: selection.current,
        frame,
        kase,
        bytes,
      } satisfies SimRequest);
    });

  const cancel = () => {
    branchId.current++;
    branchWaiter.current?.(null);
    branchWaiter.current = null;
    recordWaiter.current?.(null);
    recordWaiter.current = null;
    waiter.current?.(null);
    waiter.current = null;
    selection.current = 0;
    setPoints([]);
  };

  return { reply, stopRecording, scrub, seek, branch, points, cancel, sought: useCallback(() => sought.current, []) };
}
