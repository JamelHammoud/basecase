import type { KitStage, KitTry } from './kitSchedule';

export interface StageRun<P> {
  policy: P | null;
  folder: string | null;
}

export interface Judgement<S> {
  skill: S | null;
  score: number;
}

export interface TryPlan<P, S> {
  tries: readonly KitTry[];
  train: (stage: KitStage, from: { seed: number; folder: string | null }) => Promise<StageRun<P>>;
  validate: (policy: P) => Promise<number>;
  judge: (policy: P) => Promise<Judgement<S>>;
  aborted: () => boolean;
}

interface Tried<S> extends Judgement<S> {
  folder: string | null;
}

interface Candidate<P> {
  policy: P;
  folder: string | null;
}

async function trainSeed<P, S>(
  plan: TryPlan<P, S>,
  stages: readonly KitStage[],
  from: { seed: number; folder: string | null },
): Promise<Candidate<P> | null> {
  let folder = from.folder;
  let policy: P | null = null;

  for (const stage of stages) {
    if (plan.aborted()) return null;

    const run = await plan.train(stage, { seed: from.seed, folder });

    if (!run.policy) return null;

    policy = run.policy;
    folder = run.folder;
  }

  return policy === null ? null : { policy, folder };
}

async function bestOf<P, S>(plan: TryPlan<P, S>, candidates: Candidate<P>[]): Promise<Candidate<P> | null> {
  if (candidates.length < 2) return candidates[0] ?? null;

  let best = { candidate: candidates[0], score: -Infinity };

  for (const candidate of candidates) {
    if (plan.aborted()) return null;

    const score = await plan.validate(candidate.policy);

    if (score > best.score) best = { candidate, score };
  }

  return best.candidate;
}

async function runTry<P, S>(
  plan: TryPlan<P, S>,
  tried: KitTry,
  from: { seed: number; folder: string | null },
): Promise<Tried<S> | null> {
  const candidates: Candidate<P>[] = [];

  for (let s = 0; s < tried.seeds; s++) {
    const candidate = await trainSeed(plan, tried.stages, { seed: from.seed + s, folder: from.folder });

    if (candidate) candidates.push(candidate);
  }

  const chosen = await bestOf(plan, candidates);

  return chosen ? { ...(await plan.judge(chosen.policy)), folder: chosen.folder } : null;
}

export async function firstPassingTry<P, S>(plan: TryPlan<P, S>): Promise<S | null> {
  const best = { folder: null as string | null, score: -Infinity };
  let seed = 1;

  for (const tried of plan.tries) {
    if (plan.aborted()) return null;

    const result = await runTry(plan, tried, { seed, folder: best.folder });

    seed += tried.seeds;

    if (result?.skill) return result.skill;

    if (result?.folder && result.score > best.score)
      Object.assign(best, { folder: result.folder, score: result.score });
  }

  return null;
}
