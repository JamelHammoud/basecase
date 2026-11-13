import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import type { MultiplyJob, Variation } from './multiply';
import { multiplySession, type SessionOptions } from './multiplySession';
import type { TryRecord } from './tries';

const SOURCE: TryRecord = {
  id: 'try-a',
  caseId: 'pick-up-a-block',
  robot: 'Arm',
  at: '2026-11-13T10:00:00.000Z',
  passed: true,
  margin: 0.2,
  seconds: 10,
  manifest: { formatVersion: 1, caseHash: 'c', modelHash: 'm', seed: 0, frames: 500, dt: 0.02, commands: true },
};

const passes = (...seeds: number[]): Variation[] =>
  seeds.map((seed) => ({ seed, passed: true, margin: 0.1, recording: { frames: 10, dt: 0.02 } as Recording }));

function fakeRun() {
  let onKept: Parameters<SessionOptions['start']>[2]['onKept'] = () => {};
  let finish = () => {};
  const state = { stopped: false };
  const done = new Promise<void>((resolve) => (finish = resolve));
  const start: SessionOptions['start'] = (_job, _batches, options) => {
    onKept = options.onKept;

    return { done, stop: () => (state.stopped = true) };
  };

  return { start, state, answer: (kept: Variation[], seeds: number[]) => onKept(kept, seeds), end: () => finish() };
}

function fakeStore() {
  const saved = new Set<string>();
  const gate = { open: Promise.resolve() };

  return {
    saved,
    gate,
    store: {
      save: async (id: string) => {
        await gate.open;
        saved.add(id);
      },
      remove: async (id: string) => void saved.delete(id),
    },
  };
}

function session() {
  const run = fakeRun();
  const recordings = fakeStore();
  const landed: TryRecord[] = [];
  const progress: number[] = [];
  const multiply = multiplySession({
    source: SOURCE,
    job: {} as MultiplyJob,
    batches: [
      [4, 5],
      [6, 7],
    ],
    after: 3,
    start: run.start,
    store: recordings.store,
    onTries: (records) => landed.push(...records),
    onProgress: (ran) => progress.push(ran),
  });

  return { run, recordings, landed, progress, multiply };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a Multiply session', () => {
  it('saves and lands each pass with its seed, and counts on from the highest seed run', async () => {
    const { run, recordings, landed, progress, multiply } = session();

    run.answer(passes(5), [4, 5]);
    run.answer([], [6, 7]);
    run.end();

    expect(await multiply.done).toEqual({ made: 1, tried: 7, dropped: false });
    expect(landed.map((t) => t.manifest)).toMatchObject([{ seed: 5, source: 'try-a' }]);
    expect([...recordings.saved]).toEqual(landed.map((t) => t.id));
    expect(progress).toEqual([2, 4]);
  });

  it('when its try is deleted mid-run, stops, deletes what it saved and lands nothing late', async () => {
    const { run, recordings, landed, progress, multiply } = session();

    run.answer(passes(4, 5), [4, 5]);
    await settled();
    expect(landed).toHaveLength(2);

    multiply.drop();
    expect(run.state.stopped).toBe(true);

    run.answer(passes(6), [6, 7]);
    run.end();

    expect(await multiply.done).toMatchObject({ dropped: true });
    expect(landed).toHaveLength(2);
    expect(recordings.saved.size).toBe(0);
    expect(progress).toEqual([2]);
  });

  it('deletes a batch whose recordings were still saving when its try was deleted', async () => {
    const { run, recordings, landed, multiply } = session();
    let release = () => {};

    recordings.gate.open = new Promise<void>((resolve) => (release = resolve));
    run.answer(passes(4), [4, 5]);
    multiply.drop();
    release();
    run.end();

    expect(await multiply.done).toMatchObject({ made: 0, dropped: true });
    await settled();
    expect(landed).toEqual([]);
    expect(recordings.saved.size).toBe(0);
  });
});
