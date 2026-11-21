import { describe, expect, it } from 'vitest';
import { seedJobs } from './seeds.mjs';

describe('bounded remote seed work', () => {
  it('splits both wall time and iterations without multiplying either budget', () => {
    const jobs = seedJobs({ minutes: 3, maxIterations: 7, seed: 41, threads: 32 }, { attempts: 3, concurrency: 2 });

    expect(jobs.map((job) => job.seed)).toEqual([41, 42, 43]);
    expect(jobs.map((job) => job.maxIterations)).toEqual([3, 2, 2]);
    expect(jobs.reduce((sum, job) => sum + job.minutes, 0)).toBe(3);
    expect(jobs.every((job) => job.threads === 1)).toBe(true);
  });

  it('refuses unbounded settings and budgets rather than silently expanding work', () => {
    for (const settings of [
      { attempts: 5, concurrency: 2 },
      { attempts: 2, concurrency: 3 },
    ])
      expect(() => seedJobs({ minutes: 1 }, settings)).toThrow();

    expect(() => seedJobs({ minutes: Infinity }, { attempts: 2, concurrency: 1 })).toThrow();
    expect(() => seedJobs({ minutes: 1, maxIterations: 1 }, { attempts: 2, concurrency: 1 })).toThrow();
  });
});
