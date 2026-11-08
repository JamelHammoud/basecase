import type { PolicySpec } from '../sim/policy';

export interface ForgeJob {
  name: string;
  xml: string;
  job: Record<string, unknown>;
}

export interface ForgeOutcome {
  ok: boolean;
  policy: PolicySpec | null;
  events: object[];
  stderr: string;
}

export type ForgeRunner = (job: ForgeJob) => Promise<ForgeOutcome>;

export type SkillSave = (path: string, text: string) => Promise<void>;

export interface ForgeTally {
  steps: number;
  forgeRuns: number;
}

const doneSteps = (events: object[]) => {
  const done = events.find((e) => (e as { type?: unknown }).type === 'done') as { steps?: unknown } | undefined;

  return typeof done?.steps === 'number' && Number.isFinite(done.steps) ? done.steps : 0;
};

export async function runCounted(forge: ForgeRunner, job: ForgeJob, tally: ForgeTally): Promise<ForgeOutcome> {
  const outcome = await forge(job);

  tally.forgeRuns += 1;
  tally.steps += doneSteps(outcome.events);

  return outcome;
}

export const lastError = (outcome: ForgeOutcome) =>
  outcome.stderr
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .at(-1) ?? 'Forge stopped without a policy.';
