import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseCheckJob, CaseCheckReply, WireRobot } from './caseCheckJob';
import { CaseCheckPool, type WorkerLike } from './caseChecksClient';
import type { Case } from './schema';
import { registerWorldAsset } from './worldAssets';
import type { WorldAsset } from './worldAssets';

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

    this.answerFor(id, reply);
  }

  answerFor(id: number, reply: CaseCheckReply | { error: string }) {
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

  it('releases stale running and queued checks, ignores late answers and puts the latest model first', async () => {
    const { pool: p, workers } = pool();
    const running = p.run(0, runs([1]), { tag: 'old', robot: () => robot });
    const stale = p.run(0, runs([2]), { tag: 'old', robot: () => robot });
    const wanted = p.run(0, runs([3]), { tag: 'new', robot: () => robot });
    const model = p.run(0, { type: 'model', robot, walks: [] }, { first: true });
    const stopped = Promise.allSettled([running, stale]);

    p.keepOnly(new Set(['new']));
    expect((await stopped).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(workers[0].terminated).toBe(false);
    expect(workers[0].posted[0].job).toHaveProperty('stopFlag', new Int32Array([1]));
    workers[0].answer(ran);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted[1].job.type).toBe('model');
    workers[0].answerFor(workers[0].posted[0].id, ran);
    expect(workers[0].posted).toHaveLength(2);
    workers[0].answer({ type: 'model', modelHash: 'm1', walk: null, stop: null });
    await model;
    expect(workers[0].posted[2].job).toMatchObject({ seeds: [3] });
    expect(workers[0].posted[2].job).not.toHaveProperty('robot');
    workers[0].answer(ran);
    await wanted;
    p.dispose();
  });

  it('terminates stale workers when shared cancellation memory is unavailable', async () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);

    const { pool: p, workers } = pool();
    const running = p.run(0, runs([1]), { tag: 'old', robot: () => robot });
    const wanted = p.run(0, runs([2]), { tag: 'new', robot: () => robot });
    const stopped = expect(running).rejects.toThrow();

    p.keepOnly(new Set(['new']));
    await stopped;
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted[0].job).toMatchObject({ seeds: [2], robot });
    workers[1].answer(ran);
    await wanted;
    p.dispose();
  });

  it('keeps another group’s queued jobs when a check drops its own', async () => {
    const { pool: p, workers } = pool();
    const running = p.run(0, runs([1]), { group: 'recording', tag: 'held', robot: () => robot });
    const stale = p.run(0, runs([2]), { tag: 'old', robot: () => robot });
    const other = p.run(0, runs([3]), { tag: 'multiply', group: 'multiply', robot: () => robot });

    p.keepOnly(new Set());
    await expect(stale).rejects.toThrow();
    workers[0].answer(ran);
    await running;
    expect(workers[0].posted[1].job).toMatchObject({ seeds: [3] });

    const stopped = expect(other).rejects.toThrow();

    p.keepOnly(new Set(), 'multiply');
    await stopped;
    expect(workers[0].terminated).toBe(false);
    expect(workers[0].posted[1].job).toHaveProperty('stopFlag', new Int32Array([1]));
    workers[0].answer(ran);
    expect(workers).toHaveLength(1);
    p.dispose();
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

  it('sends the current world hulls on every job while reusing the same robot', async () => {
    const { pool: p, workers } = pool();
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
    const hash = 'c'.repeat(64);
    const asset = {
      world: { name: 'Room', splat: { bytes: new Uint8Array(1024) } },
      pieces: [{ positions, indices: new Uint32Array([0, 1, 2]) }],
    } as WorldAsset;

    registerWorldAsset(hash, asset);

    const inWorld = (position: [number, number, number]) => ({
      ...runs([1]),
      kase: { ...kase, world: { objects: [], imported: { hash, position } } } as Case,
    });
    const first = p.run(0, inWorld([0, 0, 0]), { robot: () => robot });

    expect(workers[0].posted[0].job).toMatchObject({
      worldColliders: [{ convexVertices: positions, position: [0, 0, 0], visible: false, behavior: 'static' }],
    });
    expect(JSON.stringify(workers[0].posted[0])).not.toContain('splat');
    workers[0].answer(ran);
    await first;

    const second = p.run(0, inWorld([1000, 0, 0]), { robot: () => robot });

    expect(workers[0].posted[1].job).not.toHaveProperty('robot');
    expect(workers[0].posted[1].job).toMatchObject({ worldColliders: [{ position: [1000, 0, 0] }] });
    workers[0].answer(ran);
    await second;
  });
});

it('disposes running and queued class jobs without recreating a worker', async () => {
  const { pool: p, workers } = pool();
  const running = p.run(0, runs([1]));
  const queued = p.run(0, runs([2]));
  const stopped = Promise.allSettled([running, queued]);

  p.dispose();

  expect((await stopped).map((result) => result.status)).toEqual(['rejected', 'rejected']);
  expect(workers.every((worker) => worker.terminated)).toBe(true);
  await expect(p.run(0, runs([3]))).rejects.toThrow('Canceled');
  expect(workers).toHaveLength(1);
});

it('keeps one existing idle deadline after cancellation leaves a cached worker', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { hardwareConcurrency: 8 });

  const { pool: p, workers } = pool();

  try {
    const cached = p.run(1, runs([1]));

    workers[0].answer(ran);
    await cached;

    const running = p.run(0, runs([2]), { tag: 'superseded' });
    const stopped = expect(running).rejects.toThrow();

    p.keepOnly(new Set());
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
    workers[1].answer({ error: 'Canceled' });
    p.keepOnly(new Set());
    expect(vi.getTimerCount()).toBe(1);
    vi.runOnlyPendingTimers();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  } finally {
    p.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
