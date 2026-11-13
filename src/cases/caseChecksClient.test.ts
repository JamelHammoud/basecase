import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob, CaseCheckReply, WireRobot } from './caseCheckJob';
import { CaseCheckPool, type WorkerLike } from './caseChecksClient';
import type { Case } from './schema';

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  posted: Array<{ id: number; job: CaseCheckJob }> = [];
  terminated = false;

  postMessage(message: { id: number; job: CaseCheckJob }) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  answer(reply: CaseCheckReply | { error: string }) {
    const { id } = this.posted.at(-1)!;
    const data = 'error' in reply ? { id, error: reply.error } : { id, reply };

    this.onmessage?.({ data } as MessageEvent);
  }
}

const robot = { id: 'scene', parts: [], joints: [], measures: {}, triangles: {} } as WireRobot;
const kase = { id: 'flag' } as Case;
const runs = (seeds: number[], modelHash = 'm1') => ({
  type: 'runs' as const,
  kase,
  modelHash,
  seeds,
  walk: null,
  stop: null,
});
const ran = { type: 'runs', result: { outcomes: [] } } as CaseCheckReply;

function pool() {
  const workers: FakeWorker[] = [];
  const made = new CaseCheckPool(() => {
    const worker = new FakeWorker();

    workers.push(worker);

    return worker;
  });

  return { pool: made, workers };
}

describe('the Case checks pool', () => {
  beforeEach(() => vi.stubGlobal('navigator', { hardwareConcurrency: 8 }));
  afterEach(() => vi.unstubAllGlobals());

  it('sends each worker one job at a time, and the robot only when it doesn’t hold that model', async () => {
    const { pool: p, workers } = pool();
    const wire = vi.fn(() => robot);
    const first = p.run(0, runs([1]), { robot: wire });
    const second = p.run(0, runs([2]), { robot: wire });

    expect(workers[0].posted).toHaveLength(1);
    expect(workers[0].posted[0].job).toMatchObject({ seeds: [1], robot });
    workers[0].answer(ran);
    await first;
    expect(workers[0].posted[1].job).toMatchObject({ seeds: [2] });
    expect(workers[0].posted[1].job).not.toHaveProperty('robot');
    workers[0].answer(ran);
    await second;
    expect(wire).toHaveBeenCalledTimes(1);
  });

  it('drops queued jobs a newer check no longer wants, and puts the model first', async () => {
    const { pool: p, workers } = pool();
    const running = p.run(0, runs([1]), { tag: 'old', robot: () => robot });
    const stale = p.run(0, runs([2]), { tag: 'old', robot: () => robot });
    const wanted = p.run(0, runs([3]), { tag: 'new', robot: () => robot });
    const model = p.run(0, { type: 'model', robot, walks: [] }, { first: true });

    p.keepOnly(new Set(['new']));
    await expect(stale).rejects.toThrow();
    workers[0].answer(ran);
    await running;
    expect(workers[0].posted[1].job.type).toBe('model');
    workers[0].answer({ type: 'model', modelHash: 'm1', walk: null, stop: null });
    await model;
    expect(workers[0].posted[2].job).toMatchObject({ seeds: [3] });
    expect(workers[0].posted[2].job).not.toHaveProperty('robot');
    workers[0].answer(ran);
    await wanted;
  });

  it('keeps another group’s queued jobs when a check drops its own', async () => {
    const { pool: p, workers } = pool();
    const running = p.run(0, runs([1]), { tag: 'old', robot: () => robot });
    const stale = p.run(0, runs([2]), { tag: 'old', robot: () => robot });
    const other = p.run(0, runs([3]), { tag: 'multiply', group: 'multiply', robot: () => robot });

    p.keepOnly(new Set());
    await expect(stale).rejects.toThrow();
    workers[0].answer(ran);
    await running;
    expect(workers[0].posted[1].job).toMatchObject({ seeds: [3] });
    p.keepOnly(new Set(), 'multiply');
    workers[0].answer(ran);
    await other;
  });

  it('rejects every job when a worker dies, and the next job starts a fresh worker', async () => {
    const { pool: p, workers } = pool();
    const a = p.run(0, runs([1]));
    const b = p.run(1, runs([2]));

    workers[0].onerror?.({ message: 'out of memory' } as ErrorEvent);
    await expect(a).rejects.toThrow('out of memory');
    await expect(b).rejects.toThrow('out of memory');
    expect(workers.every((w) => w.terminated)).toBe(true);

    const c = p.run(0, runs([3]), { robot: () => robot });

    expect(workers[2].posted[0].job).toMatchObject({ robot });
    workers[2].answer({ error: 'no model' });
    await expect(c).rejects.toThrow('no model');
  });
});
