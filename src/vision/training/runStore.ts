import { evaluationWorker } from './evaluationWorker';
import { indexedDbStore } from '../../utils/keyValueStore';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { validateVisionManifest } from '../manifest';
import { validateTrainingEvaluation, compareTraining } from './retention';
import { visionTrainingCall } from './bridge';
import type { TrainingRun } from './serviceTypes';

const store = indexedDbStore<TrainingRun>({ database: 'basecase-vision-runs', store: 'runs' });
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);

export function checkedTrainingRun(value: unknown): TrainingRun {
  const run = value as TrainingRun;

  if (
    !run ||
    run.version !== 1 ||
    !id(run.id) ||
    !id(run.datasetId) ||
    !id(run.jobId) ||
    !Number.isInteger(run.datasetVersion) ||
    run.datasetVersion < 1 ||
    !Number.isFinite(Date.parse(run.at))
  )
    throw new Error('Check the saved vision training run.');

  validateVisionManifest(run.manifest);
  validateVisionManifest(run.baseline);
  validateTrainingEvaluation(run.report);
  validateTrainingEvaluation(run.incumbentReport);

  const compared = compareTraining({
    id: run.id,
    at: run.at,
    candidate: run.report,
    incumbent: run.incumbentReport,
    history: [],
  });

  checkedComparison(run, compared);

  return run;
}

export async function storedVisionRuns(datasetId: string): Promise<TrainingRun[]> {
  if (!id(datasetId)) throw new Error('Choose a saved dataset.');

  const values = IS_WEB_DEMO
    ? (await store.values()).filter((run) => run.datasetId === datasetId)
    : await visionTrainingCall<unknown[]>('runs', datasetId);

  if (!Array.isArray(values)) throw new Error('Check the saved vision training runs.');

  const runs = values.map(checkedTrainingRun);

  for (const run of runs) await verifyRequiredRun(run);

  return runs.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function saveVisionRun(value: TrainingRun) {
  const run = checkedTrainingRun(value);

  await verifyRequiredRun(run);

  if (!IS_WEB_DEMO) {
    await visionTrainingCall('save-run', run);

    return;
  }

  const previous = await store.get(run.id);

  if (previous && JSON.stringify(previous) !== JSON.stringify(run))
    throw new Error('Keep the saved vision comparison unchanged.');

  await store.put(run.id, run);
}

function checkedComparison(run: TrainingRun, compared: ReturnType<typeof compareTraining>) {
  if (
    JSON.stringify(run.comparison.requirements) !== JSON.stringify(compared.attempt.requirements) ||
    run.kind !== run.manifest.kind ||
    run.report.task.kind !== run.kind ||
    run.manifest.model.sha256 !== run.report.modelHash ||
    run.status !== compared.status ||
    run.comparison.status !== compared.status ||
    run.comparison.reason !== compared.reason ||
    run.comparison.candidateHash !== run.report.modelHash ||
    run.comparison.incumbentHash !== run.incumbentReport.modelHash ||
    run.comparison.testHash !== run.report.testHash ||
    !/^[a-f0-9]{64}$/.test(run.checkpoint) ||
    !Array.isArray(run.provenance)
  )
    throw new Error('The saved vision comparison changed.');
}

async function verifyRequiredRun(run: TrainingRun) {
  if (!run.report.task.requirements?.length) return;

  await evaluationWorker.call('verifyRequirements', { candidate: run.report, incumbent: run.incumbentReport });
}
