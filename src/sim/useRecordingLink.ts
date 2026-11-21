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
  const recordWaiters = useRef(new Map<number | undefined, (recording: Recording | null) => void>());
  const recordPending = useRef(new Map<number | undefined, Promise<Recording | null>>());
  const completed = useRef(new Map<number | undefined, Recording | null>());
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
      const resolve =
        recordWaiters.current.get(msg.recordId) ??
        ((recording: Recording | null) =>
          msg.recordId === undefined ? undefined : completed.current.set(msg.recordId, recording));

      resolve(msg.recording);

      recordWaiters.current.delete(msg.recordId);
      recordPending.current.delete(msg.recordId);

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
    (recordId?: number): Promise<Recording | null> => {
      if (completed.current.has(recordId)) {
        const recording = completed.current.get(recordId) ?? null;

        completed.current.delete(recordId);

        return Promise.resolve(recording);
      }

      const pending = recordPending.current.get(recordId);

      if (pending) return pending;

      const worker = workerRef.current;

      if (!worker) return Promise.resolve(null);

      const result = new Promise<Recording | null>((resolve) => recordWaiters.current.set(recordId, resolve));

      recordPending.current.set(recordId, result);
      worker.postMessage({
        type: 'record',
        on: false,
        ...(recordId === undefined ? {} : { recordId }),
      } satisfies SimRequest);

      return result;
    },
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
    recordWaiters.current.forEach((resolve) => resolve(null));
    recordWaiters.current.clear();
    recordPending.current.clear();
    waiter.current?.(null);
    waiter.current = null;
    selection.current = 0;
    setPoints([]);
  };

  return { reply, stopRecording, scrub, seek, branch, points, cancel, sought: useCallback(() => sought.current, []) };
}
