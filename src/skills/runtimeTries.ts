import { errorMessage } from '../utils/errorMessage';
import type { SkillRecovery } from './skillRecovery';
import { runTries, type TriesPlan, type TriesPorts } from './triesRun';

export async function runTriesTask(plan: TriesPlan, ports: TriesPorts, recovery?: SkillRecovery) {
  await recovery?.capture({
    type: 'tries',
    model: plan.model,
    kase: plan.kase,
    job: plan.job,
    datasetId: plan.datasetId,
  });

  return runTries(plan, ports).catch((error: unknown) =>
    plan.done({ runs: null, kept: false, problem: errorMessage(error) }),
  );
}
