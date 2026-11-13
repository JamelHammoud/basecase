import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { offerSimTargets } from '../robot/intentMirror';
import type { Controller, SimStats } from './engine';
import { simDeltas, worldDeltas, type SimModel } from './mjcf';
import type { LiveRoutineInput, LiveUpdate } from '../routines/routineLive';
import type { Recording } from './recorder';
import type { CaseFacts } from '../cases/caseFacts';
import type { SimRequest, SimResponse } from './sim.worker';
import type { SimStatus } from './useSimulation';

interface LatestFrame {
  at: number;
  stats: SimStats | null;
  facts: CaseFacts | null;
}

export const newSimWorker = () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });

export function useSimWorker(
  viewportRef: React.RefObject<Viewport3DHandle | null>,
  modelRef: React.RefObject<SimModel | null>,
) {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<SimStatus>('off');
  const [playing, setPlaying] = useState(false);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ui = useRef<LatestFrame>({ at: 0, stats: null, facts: null });
  const frameHookRef = useRef<(() => void) | null>(null);
  const poseListeners = usePoseListeners();
  const { attach: attachCameras, connect: connectCameras } = useCameraLink(workerRef);
  const routineHookRef = useRef<((update: LiveUpdate) => void) | null>(null);
  const recordWaiter = useRef<((r: Recording | null) => void) | null>(null);
  const loadWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const send = useCallback((msg: SimRequest) => workerRef.current?.postMessage(msg), []);

  const handle = useCallback(
    (ev: MessageEvent<SimResponse>) => {
      const msg = ev.data;

      if (msg.type === 'ready') {
        setStatus('ready');
        loadWaiter.current?.resolve();
        loadWaiter.current = null;

        return;
      }

      if (msg.type === 'routine') {
        routineHookRef.current?.(msg);

        return;
      }

      if (msg.type === 'recorded') {
        recordWaiter.current?.(msg.recording);
        recordWaiter.current = null;

        return;
      }

      if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
        setPlaying(false);
        loadWaiter.current?.reject(new Error(msg.message));
        loadWaiter.current = null;

        return;
      }

      const m = modelRef.current;

      if (msg.type !== 'frame' || !m) return;

      ui.current.stats = msg.stats;
      ui.current.facts = msg.facts ?? null;
      showFrame(m, msg, { viewport: viewportRef.current, listeners: poseListeners.listeners.current });
      frameHookRef.current?.();

      const now = performance.now();

      if (now - ui.current.at <= 100 && msg.playing) return;

      ui.current.at = now;
      setStats(msg.stats);
      setPlaying(msg.playing);
    },
    [viewportRef, modelRef, poseListeners.listeners],
  );

  const worker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const w = attachCameras(newSimWorker());

    w.onmessage = handle;
    w.onerror = (e) => {
      setError(e.message || 'The simulator stopped.');
      setStatus('error');
    };
    workerRef.current = w;

    return w;
  }, [handle, attachCameras]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const load = useCallback(
    (w: Worker, model: SimModel, controller: Controller) =>
      new Promise<boolean>((resolve) => {
        loadWaiter.current = { resolve: () => resolve(true), reject: () => resolve(false) };
        w.postMessage({ type: 'load', model, controller } satisfies SimRequest);
      }),
    [],
  );

  const startRoutine = useCallback(
    (input: LiveRoutineInput, onUpdate: (update: LiveUpdate) => void) => {
      if (!modelRef.current || !workerRef.current) return false;

      routineHookRef.current = onUpdate;
      workerRef.current.postMessage({ type: 'routine', ...input } satisfies SimRequest);

      return true;
    },
    [modelRef],
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
    [],
  );

  return {
    stopRecording,
    status,
    setStatus,
    playing,
    setPlaying,
    stats,
    latestStats: () => (status === 'off' ? null : ui.current.stats),
    latestFacts: () => (status === 'off' ? null : ui.current.facts),
    setStats,
    error,
    setError,
    send,
    worker,
    load,
    frameHookRef,
    startRoutine,
    subscribePoses: poseListeners.subscribe,
    connectCameras,
  };
}

function useCameraLink(workerRef: React.RefObject<Worker | null>) {
  const link = useRef<CameraLink | null>(null);

  return {
    attach: useCallback((w: Worker) => {
      linkCameras(w, link.current);

      return w;
    }, []),
    connect: useCallback(
      (next: CameraLink | null) => {
        link.current = next;

        if (workerRef.current) linkCameras(workerRef.current, next);
      },
      [workerRef],
    ),
  };
}

export type CameraLink = () => MessagePort;

function linkCameras(w: Worker, link: CameraLink | null) {
  const port = link?.() ?? null;

  w.postMessage({ type: 'cameras', port } satisfies SimRequest, port ? [port] : []);
}

type PoseListener = (poses: Float64Array) => void;

function showFrame(
  m: SimModel,
  msg: Extract<SimResponse, { type: 'frame' }>,
  to: { viewport: Viewport3DHandle | null; listeners: Set<PoseListener> },
) {
  to.viewport?.setPose(simDeltas(m, msg.poses), worldDeltas(m, msg.poses));
  to.listeners.forEach((listen) => listen(msg.poses));
  offerSimTargets(
    m.joints.map((j) => j.id),
    msg.targets,
  );
}

function usePoseListeners() {
  const listeners = useRef(new Set<PoseListener>());

  return {
    listeners,
    subscribe: useCallback((listen: PoseListener) => {
      listeners.current.add(listen);

      return () => {
        listeners.current.delete(listen);
      };
    }, []),
  };
}
