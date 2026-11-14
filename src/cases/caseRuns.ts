import type { MainModule } from '@mujoco/mujoco';
import type { RunTrail } from '../utils/engineeringTypes';
import { caseRunner, type CaseResult, type CaseRobot, type RunOptions } from './runCase';
import type { Case } from './schema';
import { tripFrames, type Trip } from './tripFrames';

export const CASE_RUNS = 20;

export const MISSED = 'missed';

export interface RunOutcome {
  seed: number;
  passed: boolean;
  margin: number;
  failed: string[];
  path: Float32Array;
  trip: Trip | null;
}

export interface FailureCount {
  label: string;
  runs: number;
}

export interface CaseRuns {
  runs: number;
  passes: number;
  medianMargin: number;
  worstMargin: number;
  commonFailure: string | null;
  failures: FailureCount[];
  worstSeed: number | null;
  refusal: string | null;
  misfit: boolean;
  trails: RunTrail[];
}

export type Refusal = { refusal: string; misfit: boolean };

export type SeedRuns = Refusal | { outcomes: RunOutcome[] };

export type RunsOptions = Omit<RunOptions, 'seed' | 'controller'> & {
  controller?: RunOptions['controller'];
  stop?: string | null;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (!sorted.length) return 0;

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function failureCounts(missed: RunOutcome[]): FailureCount[] {
  const counts = new Map<string, number>();

  for (const outcome of missed) {
    for (const label of new Set(outcome.failed.length ? outcome.failed : [MISSED]))
      counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts].map(([label, runs]) => ({ label, runs })).sort((a, b) => b.runs - a.runs);
}

const worstOf = (outcomes: RunOutcome[]) =>
  outcomes.reduce<RunOutcome | null>((worst, o) => (worst === null || o.margin < worst.margin ? o : worst), null);

export const noRuns = (refusal: string, misfit = false): CaseRuns => ({
  runs: 0,
  passes: 0,
  medianMargin: -1,
  worstMargin: -1,
  commonFailure: null,
  failures: [],
  worstSeed: null,
  refusal,
  misfit,
  trails: [],
});

export const seedsUpTo = (runs: number) => Array.from({ length: runs }, (_, i) => i + 1);

export function seedBatches(runs: number, workers: number): number[][] {
  const seeds = seedsUpTo(runs);
  const size = Math.ceil(seeds.length / Math.max(1, workers));

  return Array.from({ length: Math.ceil(seeds.length / size) }, (_, i) => seeds.slice(i * size, (i + 1) * size));
}

async function firstTrip(result: CaseResult): Promise<Trip | null> {
  if (result.passed) return null;

  const trips = await tripFrames(result.case.task.contract, result.trace);

  return trips.reduce<Trip | null>((first, trip) => (first && first.frame <= trip.frame ? first : trip), null);
}

export async function seedOutcome(result: CaseResult, seed: number): Promise<RunOutcome> {
  const { passed, margin, failed, path } = result;

  return { seed, passed, margin, failed, path, trip: await firstTrip(result) };
}

const trailOf = ({ seed, passed, path, trip }: RunOutcome): RunTrail => ({ seed, passed, path, trip });

export async function runSeeds(
  mj: MainModule,
  kase: Case,
  robot: CaseRobot,
  options: RunsOptions & { seeds: number[] },
): Promise<SeedRuns> {
  const runner = caseRunner(mj, kase, robot, { ...options, controller: options.controller ?? 'reference' });

  if (runner.refusal) return { refusal: runner.refusal, misfit: true };

  if (options.stop) return { refusal: options.stop, misfit: false };

  const outcomes: RunOutcome[] = [];

  for (const seed of options.seeds) outcomes.push(await seedOutcome(await runner.run(seed), seed));

  return { outcomes };
}

export function summarizeRuns(batches: SeedRuns[]): CaseRuns {
  const refused = batches.find((b): b is Refusal => 'refusal' in b);
  const outcomes = batches.flatMap((b) => ('outcomes' in b ? b.outcomes : []));

  if (refused) return { ...noRuns(refused.refusal, refused.misfit), runs: outcomes.length };

  const missed = outcomes.filter((o) => !o.passed);
  const failures = failureCounts(missed);
  const margins = outcomes.map((o) => o.margin);

  return {
    runs: outcomes.length,
    passes: outcomes.length - missed.length,
    medianMargin: median(margins),
    worstMargin: margins.length ? Math.min(...margins) : -1,
    commonFailure: failures[0]?.label ?? null,
    failures,
    worstSeed: worstOf(missed.length ? missed : outcomes)?.seed ?? null,
    refusal: null,
    misfit: false,
    trails: [...outcomes].sort((a, b) => a.seed - b.seed).map(trailOf),
  };
}

export async function runCaseTimes(
  mj: MainModule,
  kase: Case,
  robot: CaseRobot,
  options: RunsOptions & { runs?: number } = {},
): Promise<CaseRuns> {
  const seeds = seedsUpTo(options.runs ?? CASE_RUNS);

  return summarizeRuns([await runSeeds(mj, kase, robot, { ...options, seeds })]);
}
