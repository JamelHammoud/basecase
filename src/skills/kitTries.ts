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
  judge: (policy: P) => Promise<Judgement<S>>;
  aborted: () => boolean;
}

interface Tried<S> extends Judgement<S> {
  folder: string | null;
}

async function runTry<P, S>(
  plan: TryPlan<P, S>,
  stages: KitTry,
  from: { seed: number; folder: string | null },
): Promise<Tried<S> | null> {
  let folder = from.folder;
  let policy: P | null = null;

  for (const stage of stages) {
    if (plan.aborted()) return null;

    const run = await plan.train(stage, { seed: from.seed, folder });

    if (!run.policy) return null;

    policy = run.policy;
    folder = run.folder;
  }

  return policy === null ? null : { ...(await plan.judge(policy)), folder };
}

export async function firstPassingTry<P, S>(plan: TryPlan<P, S>): Promise<S | null> {
  const best = { folder: null as string | null, score: -Infinity };

  for (const [index, stages] of plan.tries.entries()) {
    if (plan.aborted()) return null;

    const tried = await runTry(plan, stages, { seed: index + 1, folder: best.folder });

    if (tried?.skill) return tried.skill;

    if (tried?.folder && tried.score > best.score) Object.assign(best, { folder: tried.folder, score: tried.score });
  }

  return null;
}
