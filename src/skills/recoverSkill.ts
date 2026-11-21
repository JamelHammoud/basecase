import type { PolicySpec } from '../sim/policy';
import type { Case } from '../cases/schema';
import { hashOf } from './hash';
import type { SkillsJob, SkillPorts } from './skillsJob';
import type { RuntimeDeps } from './skillsRuntimeTypes';
import type { RecoveryEntry, RecoverableSkillJob } from './skillRecovery';
import { moveTag, skillRecord, type SkillRecord } from './skillRecords';
import { runTries, type TriesOutcome, type TriesVerdict } from './triesRun';

export interface RecoveryTriesPorts {
  judge: (kase: Case, policy: PolicySpec) => Promise<TriesVerdict>;
  done: (datasetId: string | undefined, outcome: TriesOutcome) => void;
}

async function recoveredRecord(
  job: RecoverableSkillJob,
  ports: SkillPorts,
  runner: RuntimeDeps['runner'],
): Promise<SkillRecord | string> {
  if (job.type === 'kit') {
    const { outcome } = await runner(job, ports);

    return outcome.kind === 'skill' ? skillRecord(outcome.skill, { kit: job.entry, model: job.model }) : outcome.reason;
  }

  if (job.type === 'move') {
    const { outcome: result } = await runner(job, ports);
    const { outcome, environment } = result;

    return outcome.kind === 'skill'
      ? skillRecord(outcome.skill, { kit: null, move: moveTag(job.animation.id, environment) })
      : outcome.reason;
  }

  const { outcome } = await runner(job, ports);

  return outcome.kind === 'skill'
    ? skillRecord(outcome.skill, { kit: null, goal: job.draft.request, environment: job.draft.environment })
    : outcome.reason;
}

export async function recoverSkill(options: {
  entry: RecoveryEntry;
  ports: SkillPorts;
  deps: Pick<RuntimeDeps, 'runner' | 'save' | 'onRecord'>;
  tries?: RecoveryTriesPorts;
}): Promise<SkillRecord | string | null> {
  const { entry, ports, deps, tries } = options;
  const request = entry.request;

  if (request.type === 'worker') return recoveredRecord(request.job, ports, deps.runner);

  if (!tries) throw new Error('Open the dataset to recover its training result.');

  await runTries(
    {
      ...request,
      judge: (policy) => tries.judge(request.kase, policy),
      done: (outcome) => tries.done(request.datasetId, outcome),
    },
    {
      forge: ports.forge,
      design: request.model.robots[0]?.key ?? 'scene',
      save: deps.save,
      onRecord: deps.onRecord,
    },
  );

  return null;
}

export const recoverableWorker = (type: string) => type === 'kit' || type === 'move' || type === 'race';

export function seededRecoveryJob(job: SkillsJob, key?: string): SkillsJob {
  if (!key || !recoverableWorker(job.type)) return job;

  const request = job as RecoverableSkillJob;
  const seed = request.seed ?? 1 + (Number.parseInt(hashOf(key).slice(0, 8), 16) % 1_000_000);

  return { ...request, seed };
}
