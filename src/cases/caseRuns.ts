import type { MainModule } from '@mujoco/mujoco';
import { caseRunner, type CaseRobot, type RunOptions } from './runCase';
import type { Case } from './schema';

export const CASE_RUNS = 20;

export const MISSED = 'missed';

export interface RunOutcome {
  passed: boolean;
  margin: number;
  failed: string[];
}

export interface CaseRuns {
  runs: number;
  passes: number;
  medianMargin: number;
  commonFailure: string | null;
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

function mostCommon(labels: string[]): string | null {
  const counts = new Map<string, number>();

  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

  let best: string | null = null;

  for (const [label, n] of counts) if (best === null || n > counts.get(best)!) best = label;

  return best;
}

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

    outcomes.push({ passed, margin, failed });
  }

  return { outcomes };
}

export function summarizeRuns(batches: SeedRuns[]): CaseRuns {
  const refused = batches.find((b): b is { refusal: string } => 'refusal' in b);
  const outcomes = batches.flatMap((b) => ('outcomes' in b ? b.outcomes : []));

  if (refused)
    return { runs: outcomes.length, passes: 0, medianMargin: -1, commonFailure: null, refusal: refused.refusal };

  const missed = outcomes.filter((o) => !o.passed);

  return {
    runs: outcomes.length,
    passes: outcomes.length - missed.length,
    medianMargin: median(outcomes.map((o) => o.margin)),
    commonFailure: mostCommon(missed.flatMap((o) => (o.failed.length ? o.failed : [MISSED]))),
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
