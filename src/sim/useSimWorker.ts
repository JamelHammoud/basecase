import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Controller, SimStats } from './engine';
import { simDeltas, type SimModel } from './mjcf';
import type { SimRequest, SimResponse } from './sim.worker';
import type { SimStatus } from './useSimulation';

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
  const [version, setVersion] = useState<string | null>(null);
  const lastUi = useRef(0);
  const loadWaiter = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const send = useCallback((msg: SimRequest) => workerRef.current?.postMessage(msg), []);

  const handle = useCallback(
    (ev: MessageEvent<SimResponse>) => {
      const msg = ev.data;

      if (msg.type === 'ready') {
        setVersion(msg.version);
        setStatus('ready');
        loadWaiter.current?.resolve();
        loadWaiter.current = null;

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

      viewportRef.current?.setPose(simDeltas(m, msg.poses));

      const now = performance.now();

      if (now - lastUi.current <= 100 && msg.playing) return;

      lastUi.current = now;
      setStats(msg.stats);
      setPlaying(msg.playing);
    },
    [viewportRef, modelRef],
  );

  const worker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const w = newSimWorker();

    w.onmessage = handle;
    w.onerror = (e) => {
      setError(e.message || 'The simulator stopped.');
      setStatus('error');
    };
    workerRef.current = w;

    return w;
  }, [handle]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const load = useCallback(
    (w: Worker, model: SimModel, controller: Controller) =>
      new Promise<boolean>((resolve) => {
        loadWaiter.current = { resolve: () => resolve(true), reject: () => resolve(false) };
        w.postMessage({ type: 'load', model, controller } satisfies SimRequest);
      }),
    [],
  );

  return {
    status,
    setStatus,
    playing,
    setPlaying,
    stats,
    setStats,
    error,
    setError,
    version,
    send,
    worker,
    load,
  };
}
