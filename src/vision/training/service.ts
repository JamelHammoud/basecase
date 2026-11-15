import type { Dataset } from '../../datasets/datasetFile';
import { exposesTestHooks } from '../../utils/platform/testHooks';
import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import { prepareVisionTraining } from './prepare';
import { trainVisionBackend } from './bridge';
import { executeVisionTraining } from './serviceCore';
import { storedVisionRuns, saveVisionRun, checkedTrainingRun } from './runStore';
import { evaluateVisionModel } from './evaluate';
import { registerRetainedVisionModel, applyRetainedVisionModel } from './models';
import type { TrainingKind } from './types';
import type {
  TrainingRun,
  TrainingOptions,
  TrainingTarget,
  VisionTrainingTestPort,
  TrainingServicePorts,
} from './serviceTypes';

export type { TrainingRun, VisionTrainingTestPort } from './serviceTypes';

let testPort: VisionTrainingTestPort | undefined;
let backendTestPort: TrainingServicePorts['train'] | undefined;

export function setVisionTrainingBackendTestPort(port?: TrainingServicePorts['train']) {
  if (!exposesTestHooks()) throw new Error('Vision training controls are unavailable.');

  backendTestPort = port;
}

const training = new Set<string>();

export function setVisionTrainingTestPort(port?: VisionTrainingTestPort) {
  if (!exposesTestHooks()) throw new Error('Vision training controls are unavailable.');

  testPort = port;
}

export async function loadVisionRuns(datasetId: string): Promise<TrainingRun[]> {
  if (testPort) return testPort.load(datasetId);

  const runs = await storedVisionRuns(datasetId);

  for (const run of runs.filter((entry) => entry.status === 'retained'))
    await registerRetainedVisionModel(run.manifest);

  return runs;
}

export async function trainVisionDataset(
  dataset: Dataset,
  kind: TrainingKind,
  options: TrainingOptions = {},
): Promise<TrainingRun> {
  if (testPort) return testPort.train(dataset, kind, options);

  if (IS_WEB_DEMO) throw new Error('Download Basecase to train a vision model.');

  if (training.has(dataset.id)) throw new Error('Stop the current training run first.');

  training.add(dataset.id);

  try {
    const run = await executeVisionTraining(dataset, kind, options, {
      prepare: prepareVisionTraining,
      train: backendTestPort ?? trainVisionBackend,
      evaluate: evaluateVisionModel,
      load: storedVisionRuns,
      save: saveVisionRun,
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID(),
    });

    if (run.status === 'retained') await registerRetainedVisionModel(run.manifest);

    return run;
  } finally {
    training.delete(dataset.id);
  }
}

export async function applyVisionRun(run: TrainingRun, target: TrainingTarget) {
  if (testPort) return testPort.apply(run, target);

  checkedTrainingRun(run);

  if (run.status !== 'retained') throw new Error('Choose a retained model.');

  const saved = (await loadVisionRuns(run.datasetId)).find((entry) => entry.id === run.id);

  if (!saved || saved.status !== 'retained' || saved.manifest.model.sha256 !== run.manifest.model.sha256)
    throw new Error('Choose a saved retained model.');

  await applyRetainedVisionModel(saved.manifest, target);
}
