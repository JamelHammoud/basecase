import type { CaseRuns } from '../cases/caseRuns';
import type { Case } from '../cases/schema';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { errorMessage } from '../utils/errorMessage';
import { skillFiles, skillHash } from './artifacts';
import { lastError, type ForgeJob, type ForgeRunner, type SkillSave } from './forgeRunner';
import { skillRecord, type SkillRecord } from './skillRecords';
import { triesSkill } from './triesTraining';
import { selectSeeds, selectionOf } from './seedSelection';

export interface TriesPlan {
  datasetId?: string;
  model: SimModel;
  kase: Case;
  job: ForgeJob;
  judge: (policy: PolicySpec) => Promise<TriesVerdict>;
  done: (outcome: TriesOutcome) => void;
}

export interface TriesVerdict {
  runs: CaseRuns;
  robotModel: string;
}

export interface TriesOutcome {
  runs: CaseRuns | null;
  kept: boolean;
  problem: string | null;
}

export interface TriesPorts {
  forge: ForgeRunner;
  design: string;
  save: SkillSave;
  onRecord: (record: SkillRecord) => void;
}

export async function runTries(plan: TriesPlan, ports: TriesPorts) {
  const startedAt = Date.now();
  const outcome = await selectSeeds(await ports.forge(plan.job));
  const policy = outcome.ok ? outcome.policy : null;

  if (!policy) return plan.done({ runs: null, kept: false, problem: lastError(outcome) });

  const selection = selectionOf(policy);

  if (selection) await ports.forge.selected?.(selection);

  const verdict = await plan.judge(policy).catch((e: unknown) => errorMessage(e));

  if (typeof verdict === 'string') return plan.done({ runs: null, kept: false, problem: verdict });

  const { runs } = verdict;
  const steps = outcome.candidates?.reduce((sum, candidate) => sum + candidate.steps, 0) ?? policy.trainedSteps;
  const cost = { wallS: (Date.now() - startedAt) / 1000, steps };
  const { model, kase } = plan;
  const made = triesSkill({
    model,
    design: ports.design,
    kase,
    policy,
    runs,
    origin: { method: 'ask-for-demo', cost, training: selectionOf(policy) },
  });

  if (made) {
    await ports.save(skillFiles(skillHash(made.skill)).skill, JSON.stringify(made.skill));
    ports.onRecord(
      skillRecord(made.skill, {
        kit: null,
        goal: kase.name,
        environment: made.environment,
        case: { id: kase.id, model: verdict.robotModel },
      }),
    );
  }

  plan.done({ runs, kept: !!made, problem: runs.refusal });
}
