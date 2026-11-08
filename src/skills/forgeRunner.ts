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

const POLICY_FILE = /[\\/]policy\.json$/;
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;

const doneEvent = (events: object[]) =>
  events.find((e) => (e as { type?: unknown }).type === 'done') as { steps?: unknown; policy?: unknown } | undefined;

const doneSteps = (events: object[]) => {
  const done = doneEvent(events);

  return typeof done?.steps === 'number' && Number.isFinite(done.steps) ? done.steps : 0;
};

export function runFolder(outcome: ForgeOutcome): string | null {
  const file = doneEvent(outcome.events)?.policy;

  if (!outcome.ok || typeof file !== 'string' || !POLICY_FILE.test(file) || !ABSOLUTE.test(file)) return null;

  return file.replace(POLICY_FILE, '');
}

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
