import type { PolicySpec } from '../sim/policy';
import type { ForgeOutcome } from './forgeRunner';

export interface SeedAttempt {
  id: string;
  seed: number;
  fingerprint: Record<string, string>;
  steps: number;
  error?: string;
  development: { kind: string; score: number } | null;
}

export interface SeedCandidate extends SeedAttempt {
  policy: PolicySpec | null;
}

export interface SeedSelection {
  evaluation: 'nominal-contract-v1' | 'cloning-validation-loss-v1';
  selected: string;
  attempts: SeedAttempt[];
}

const selections = new WeakMap<PolicySpec, SeedSelection>();

export const selectionOf = (policy: PolicySpec) => selections.get(policy);

async function developmentOf(candidate: SeedCandidate, evaluate?: (policy: PolicySpec) => Promise<number>) {
  if (!candidate.policy) return null;

  const score = evaluate ? await evaluate(candidate.policy) : candidate.development?.score;

  return Number.isFinite(score)
    ? { kind: evaluate ? 'nominal-contract-v1' : 'cloning-validation-loss-v1', score: score! }
    : null;
}

export async function selectSeeds(
  outcome: ForgeOutcome,
  evaluate?: (policy: PolicySpec) => Promise<number>,
): Promise<ForgeOutcome> {
  if (!outcome.candidates) return outcome;

  const attempts: SeedAttempt[] = [];
  let best: SeedCandidate | null = null;

  for (const candidate of outcome.candidates) {
    const { policy, ...attempt } = candidate;
    const development = await developmentOf(candidate, evaluate);

    attempts.push({ ...attempt, development });

    if (!policy || !development) continue;

    if (best === null || development.score > best.development!.score) best = { ...candidate, development };
  }

  if (!best?.policy)
    return {
      ...outcome,
      ok: false,
      policy: null,
      stderr: outcome.stderr || 'No training attempt passed development evaluation.',
    };

  selections.set(best.policy, {
    evaluation: evaluate ? 'nominal-contract-v1' : 'cloning-validation-loss-v1',
    selected: best.id,
    attempts,
  });

  return { ...outcome, ok: true, policy: best.policy, run: best.id };
}
