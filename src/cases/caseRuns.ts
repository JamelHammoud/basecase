import type { MainModule } from '@mujoco/mujoco';
import { caseRunner, type CaseRobot, type RunOptions } from './runCase';
import type { Case } from './schema';

export const CASE_RUNS = 20;

export const MISSED = 'missed';

export interface RunOutcome {
  seed: number;
  passed: boolean;
  margin: number;
  failed: string[];
}

export interface FailureCount {
  label: string;
  runs: number;
}

export interface CaseRuns {
  runs: number;
  passes: number;
  medianMargin: number;
  commonFailure: string | null;
  failures: FailureCount[];
  worstSeed: number | null;
  refusal: string | null;
}

export type SeedRuns = { refusal: string } | { outcomes: RunOutcome[] };

export type RunsOptions = Omit<RunOptions, 'seed' | 'controller'> & { controller?: RunOptions['controller'] };

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

export const noRuns = (refusal: string): CaseRuns => ({
  runs: 0,
  passes: 0,
  medianMargin: -1,
  commonFailure: null,
  failures: [],
  worstSeed: null,
  refusal,
});

export const seedsUpTo = (runs: number) => Array.from({ length: runs }, (_, i) => i + 1);

export function seedBatches(runs: number, workers: number): number[][] {
  const seeds = seedsUpTo(runs);
  const size = Math.ceil(seeds.length / Math.max(1, workers));

  return Array.from({ length: Math.ceil(seeds.length / size) }, (_, i) => seeds.slice(i * size, (i + 1) * size));
}

export async function runSeeds(
  mj: MainModule,
  kase: Case,
  robot: CaseRobot,
  options: RunsOptions & { seeds: number[] },
): Promise<SeedRuns> {
  const runner = caseRunner(mj, kase, robot, { ...options, controller: options.controller ?? 'reference' });

  if (runner.refusal) return { refusal: runner.refusal };

  const outcomes: RunOutcome[] = [];

  for (const seed of options.seeds) {
    const { passed, margin, failed } = await runner.run(seed);

    outcomes.push({ seed, passed, margin, failed });
  }

  return { outcomes };
}

export function summarizeRuns(batches: SeedRuns[]): CaseRuns {
  const refused = batches.find((b): b is { refusal: string } => 'refusal' in b);
  const outcomes = batches.flatMap((b) => ('outcomes' in b ? b.outcomes : []));

  if (refused) return { ...noRuns(refused.refusal), runs: outcomes.length };

  const missed = outcomes.filter((o) => !o.passed);
  const failures = failureCounts(missed);

  return {
    runs: outcomes.length,
    passes: outcomes.length - missed.length,
    medianMargin: median(outcomes.map((o) => o.margin)),
    commonFailure: failures[0]?.label ?? null,
    failures,
    worstSeed: worstOf(missed.length ? missed : outcomes)?.seed ?? null,
    refusal: null,
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
