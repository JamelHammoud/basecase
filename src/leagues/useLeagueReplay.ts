import { useEffect, useRef, useState } from 'react';
import type { SeedReplay } from '../cases/seedReplay';
import type { LeagueReplayJob, LeagueReplayReply } from './replay.worker';

export interface BrowserReplay {
  replay: SeedReplay;
  failed: string[];
}

export function useLeagueReplay(entryId: string) {
  const [result, setResult] = useState<BrowserReplay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);

  const dispose = () => {
    active.current?.worker.terminate();
    clearTimeout(active.current?.timer);
    active.current = null;
  };

  useEffect(() => {
    return dispose;
  }, [entryId]);

  const clear = () => {
    dispose();
    setBusy(false);
    setResult(null);
    setError(null);
  };

  const run = (job: LeagueReplayJob) => {
    clear();
    setBusy(true);

    const worker = new Worker(new URL('./replay.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      dispose();
      setBusy(false);
    };
    const timer = setTimeout(() => {
      finish();
      setError('The replay stopped. Replay the seed again.');
    }, 60000);

    active.current = { worker, timer };
    worker.onmessage = ({ data }: MessageEvent<LeagueReplayReply>) => {
      finish();

      if ('error' in data) setError(data.error);
      else setResult(data);
    };
    worker.onerror = () => {
      finish();
      setError('The replay stopped. Replay the seed again.');
    };
    worker.postMessage(job);
  };

  return { result, busy, error, run, clear };
}
