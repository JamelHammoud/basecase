import type { Recording } from '../sim/recorder';
import type { MultiplyJob, Variation } from './multiply';
import type { MultiplyRun } from './multiplyClient';
import { generatedTry, type TryRecord } from './tries';

export interface RecordingStore {
  save: (id: string, recording: Recording) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

export interface SessionOptions {
  source: TryRecord;
  job: MultiplyJob;
  batches: number[][];
  after: number;
  start: (job: MultiplyJob, batches: number[][], options: { onKept: OnKept }) => MultiplyRun;
  store: RecordingStore;
  onTries: (records: TryRecord[]) => void;
  onProgress: (ran: number) => void;
}

type OnKept = (kept: Variation[], seeds: number[]) => void;

export interface SessionResult {
  made: number;
  tried: number;
  dropped: boolean;
}

export interface MultiplySession {
  stop: () => void;
  drop: () => void;
  done: Promise<SessionResult>;
}

export function multiplySession(options: SessionOptions): MultiplySession {
  const { source, store, onTries, onProgress } = options;
  const added: string[] = [];
  let dropped = false;
  let tried = options.after;
  let ran = 0;
  let made = 0;
  let saving = Promise.resolve();

  const keep = async (kept: Variation[], seeds: number[]) => {
    const records = kept.map((v) => generatedTry(source, v));

    tried = Math.max(tried, ...seeds);
    ran += seeds.length;
    await Promise.all(records.map((r, i) => store.save(r.id, kept[i].recording)));

    if (dropped) {
      records.forEach((r) => void store.remove(r.id));

      return;
    }

    added.push(...records.map((r) => r.id));
    made += records.length;

    if (records.length) onTries(records);

    onProgress(ran);
  };

  const run = options.start(options.job, options.batches, {
    onKept: (kept, seeds) => (saving = saving.then(() => keep(kept, seeds))),
  });
  const finish = async (): Promise<SessionResult> => {
    try {
      await run.done;
    } finally {
      await saving;
    }

    return { made, tried, dropped };
  };

  return {
    stop: run.stop,
    drop: () => {
      dropped = true;
      added.splice(0).forEach((id) => void store.remove(id));
      run.stop();
    },
    done: finish(),
  };
}
