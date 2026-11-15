import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisTask } from './analysisOps';
import type { SweepSpec } from './sweep';
import type { StrengthJob } from '../../strength/types';
import { strengthIn, sweepsIn } from './analysisPool';

const dispatched = vi.hoisted(() => {
  vi.stubGlobal('navigator', { hardwareConcurrency: 8 });

  return [] as AnalysisTask[];
});

vi.mock('../../utils/workerRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/workerRpc')>()),
  workerClient: () => ({
    call: async (_op: string, { task }: { task: AnalysisTask }) => {
      dispatched.push(task);

      if (task.kind === 'sweeps') return task.sweeps.map((s) => s.anglesDeg);

      if (task.kind === 'strength') return task.jobs.map((j) => (j.part === 'missing' ? null : { key: j.key }));

      throw new Error('Unexpected analysis task');
    },
  }),
}));

beforeEach(() => dispatched.splice(0));
afterAll(() => vi.unstubAllGlobals());

function observed<T>(values: T[]) {
  let reads = 0;
  const input = values.map((value, i) => {
    Object.defineProperty(values, i, {
      get: () => {
        reads++;

        return value;
      },
    });

    return value;
  });

  return { input: values, original: input, reads: () => reads };
}

const scene = { instances: [], shapes: new Map(), geometries: new Map() };

describe('analysis worker batches', () => {
  it.each([0, 1, 2, 4, 11])('dispatches %i sweeps once and restores their request order', async (count) => {
    const sweeps = observed(
      Array.from({ length: count }, (_, i): SweepSpec => ({
        moving: ['arm'],
        origin: [0, 0, 0],
        axis: [0, 0, 1],
        anglesDeg: [i],
      })),
    );

    expect(await sweepsIn(scene, sweeps.input)).toEqual(sweeps.original.map((s) => s.anglesDeg));
    expect(sweeps.reads()).toBe(count);
    expect(dispatched).toHaveLength(Math.min(count, 4));
    expect(dispatched.map((task) => task.kind === 'sweeps' && task.sweeps.map((s) => s.anglesDeg[0]))).toEqual(
      Array.from({ length: Math.min(count, 4) }, (_, w) =>
        sweeps.original.filter((_, i) => i % Math.min(count, 4) === w).map((s) => s.anglesDeg[0]),
      ),
    );
  });

  it('dispatches strength jobs once and keeps missing readings in place', async () => {
    const jobs = observed(
      Array.from({ length: 11 }, (_, i): StrengthJob => ({
        key: `job-${i}`,
        part: i % 3 === 0 ? 'missing' : 'bracket',
        material: 'PLA',
        infillPct: 20,
        load: { origin: [0, 0, 0], axis: [0, 0, 1], torqueNmm: 100, screws: [] },
        holds: [],
      })),
    );

    expect(await strengthIn(scene, jobs.input)).toEqual(
      jobs.original.map((j) => (j.part === 'missing' ? null : { key: j.key })),
    );
    expect(jobs.reads()).toBe(11);
    expect(dispatched).toHaveLength(4);
    expect(dispatched.map((task) => task.kind === 'strength' && task.jobs.map((j) => j.key))).toEqual([
      ['job-0', 'job-4', 'job-8'],
      ['job-1', 'job-5', 'job-9'],
      ['job-2', 'job-6', 'job-10'],
      ['job-3', 'job-7'],
    ]);
    expect(await strengthIn(scene, [])).toEqual([]);
    expect(dispatched).toHaveLength(4);
  });
});
