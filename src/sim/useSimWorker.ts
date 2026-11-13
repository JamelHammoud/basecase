import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { offerSimTargets } from '../robot/intentMirror';
import { noteSimAngles } from '../robot/robotTwin';
import type { Controller, SimStats } from './engine';
import { simDeltas, worldDeltas, type SimModel } from './mjcf';
import type { LiveRoutineInput, LiveUpdate } from '../routines/routineLive';
import type { CaseFacts } from '../cases/caseFacts';
import type { Scan } from './scanner';
import type { SimRequest, SimResponse } from './sim.worker';
import type { SimStatus } from './useSimulation';
import { useRecordingLink } from './useRecordingLink';

interface LatestFrame {
  at: number;
  stats: SimStats | null;
  facts: CaseFacts | null;
  scan: Scan | null;
  joints: Float64Array | null;
}

function noteFrame(latest: LatestFrame, msg: Extract<SimResponse, { type: 'frame' }>) {
  latest.stats = msg.stats;
  latest.facts = msg.facts ?? null;
  latest.scan = msg.scan ?? latest.scan;
  latest.joints = msg.joints;
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
  const ui = useRef<LatestFrame>({ at: 0, stats: null, facts: null, scan: null, joints: null });
  const frameHookRef = useRef<FrameHook | null>(null);
  const poseListeners = usePoseListeners();
  const { attach: attachCameras, connect: connectCameras } = useCameraLink(workerRef);
  const routineHookRef = useRef<((update: LiveUpdate) => void) | null>(null);
  const loadWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const recordingLink = useRecordingLink(workerRef);
  const recordingReply = recordingLink.reply;

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

      if (msg.type === 'recorded' || msg.type === 'scrubbed' || msg.type === 'sought') {
        recordingReply(msg);

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

      noteFrame(ui.current, msg);
      showFrame(m, msg, { viewport: viewportRef.current, listeners: poseListeners.listeners.current });
      frameHookRef.current?.({ poses: msg.poses, time: msg.stats.time });

      const now = performance.now();

      if (now - ui.current.at <= 100 && msg.playing) return;

      ui.current.at = now;
      setStats(msg.stats);
      setPlaying(msg.playing);
    },
    [viewportRef, modelRef, poseListeners.listeners, recordingReply],
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

  return {
    stopRecording: recordingLink.stopRecording,
    scrub: recordingLink.scrub,
    seek: recordingLink.seek,
    sought: recordingLink.sought,
    status,
    setStatus,
    playing,
    setPlaying,
    stats,
    latestStats: () => (status === 'off' ? null : ui.current.stats),
    latestFacts: () => (status === 'off' ? null : ui.current.facts),
    latestScan: () => (status === 'off' ? null : ui.current.scan),
    latestJoints: () => (status === 'off' ? null : ui.current.joints),
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

type PoseListener = (poses: Float64Array, frame: { joints: Float64Array }) => void;

export interface SimFrame {
  poses: Float64Array;
  time: number;
}

export type FrameHook = (frame: SimFrame) => void;

function showFrame(
  m: SimModel,
  msg: Extract<SimResponse, { type: 'frame' }>,
  to: { viewport: Viewport3DHandle | null; listeners: Set<PoseListener> },
) {
  const robots = simDeltas(m, msg.poses);
  const world = worldDeltas(m, msg.poses);

  if (m.robots.length > 1) robots.forEach((delta, id) => world.set(id, delta));

  to.viewport?.setPose(robots, world);

  if (msg.scan) to.viewport?.setScan(msg.scan.points);

  to.listeners.forEach((listen) => listen(msg.poses, msg));

  const ids = m.joints.map((j) => j.id);

  offerSimTargets(
    ids,
    m.joints.map((_, i) => msg.joints[i * 3]),
  );
  noteSimAngles(
    ids,
    Float64Array.from(m.joints, (_, i) => msg.joints[i * 3 + 1]),
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
