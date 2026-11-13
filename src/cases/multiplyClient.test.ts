import { describe, expect, it } from 'vitest';
import type { MultiplyJob, Variation } from './multiply';
import { startMultiply, type MultiplyWorker } from './multiplyClient';

const JOB = { kase: { id: 'k' } } as unknown as MultiplyJob;

class FakeWorker implements MultiplyWorker {
  onmessage: MultiplyWorker['onmessage'] = null;
  onerror: MultiplyWorker['onerror'] = null;
  sent: Array<{ job?: MultiplyJob; seeds: number[] }> = [];
  answered = 0;
  terminated = false;

  postMessage(message: { job?: MultiplyJob; seeds: number[] }) {
    this.sent.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  answer(seeds: number[]) {
    this.answered++;

    const kept = seeds.filter((s) => s % 2).map((seed) => ({ seed }) as unknown as Variation);

    this.onmessage?.({ data: { kept } } as MessageEvent);
  }
}

const pending = (workers: FakeWorker[]) => workers.find((w) => w.sent.length > w.answered);

function pool() {
  const workers: FakeWorker[] = [];
  const spawn = () => {
    const w = new FakeWorker();

    workers.push(w);

    return w;
  };

  return { workers, spawn };
}

describe('startMultiply', () => {
  it('sends the try once per worker, feeds each a batch at a time and keeps what comes back', async () => {
    const { workers, spawn } = pool();
    const kept: number[] = [];
    const run = startMultiply(JOB, [[1, 2], [3, 4], [5]], { onKept: (v) => kept.push(...v.map((x) => x.seed)), spawn });

    expect(workers[0].sent[0]).toEqual({ job: JOB, seeds: [1, 2] });

    for (let w = pending(workers); w; w = pending(workers)) w.answer(w.sent.at(-1)!.seeds);

    await run.done;
    expect(kept.sort()).toEqual([1, 3, 5]);
    expect(workers.flatMap((w) => w.sent.slice(1)).every((m) => m.job === undefined)).toBe(true);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('stops at once: the workers end, done resolves and later answers are dropped', async () => {
    const { workers, spawn } = pool();
    const kept: number[] = [];
    const run = startMultiply(JOB, [[1], [3], [5], [7]], { onKept: (v) => kept.push(...v.map((x) => x.seed)), spawn });

    workers[0].answer([1]);
    run.stop();
    await run.done;
    workers[0].answer([3]);

    expect(kept).toEqual([1]);
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('fails the run with the worker’s message', async () => {
    const { workers, spawn } = pool();
    const run = startMultiply(JOB, [[1]], { onKept: () => {}, spawn });

    workers[0].onmessage?.({ data: { error: 'Boom.' } } as MessageEvent);

    await expect(run.done).rejects.toThrow('Boom.');
  });
});
