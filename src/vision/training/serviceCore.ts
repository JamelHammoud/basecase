import { canonicalRequirements } from './requirements';
import type { Dataset } from '../../datasets/datasetFile';
import { VISION_MODEL_BYTES } from '../manifest';
import { defaultTrainingMetric } from './metrics';
import { compareTraining } from './retention';
import { validateTrainingTask } from './metricsValidation';
import type { TrainingKind, TrainingTask } from './types';
import type { TrainingOptions, TrainingRun, TrainingServicePorts } from './serviceTypes';

export function trainingStopped(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

function taskFor(
  prepared: Awaited<ReturnType<TrainingServicePorts['prepare']>>,
  kind: TrainingKind,
  options: TrainingOptions,
): TrainingTask {
  const task: TrainingTask = {
    kind,
    classes: prepared.classes,
    metric: defaultTrainingMetric(kind),
    limits: options.limits ?? { maxInferenceMs: 100, maxModelBytes: VISION_MODEL_BYTES },
    ...(kind === 'keypoints' ? { keypointTolerance: 0.05 } : {}),
  };

  return {
    ...task,
    ...(options.requirements?.length ? { requirements: canonicalRequirements(options.requirements, task) } : {}),
  };
}

function matchingIncumbent(runs: TrainingRun[], task: TrainingTask) {
  return [...runs]
    .reverse()
    .find(
      (run) =>
        run.status === 'retained' &&
        run.kind === task.kind &&
        JSON.stringify(run.report.task.classes) === JSON.stringify(task.classes),
    );
}

function checkedParity(parity: TrainingRun['parity']) {
  if (
    !Number.isFinite(parity.maxAbsoluteError) ||
    parity.maxAbsoluteError < 0 ||
    !Number.isFinite(parity.tolerance) ||
    parity.tolerance <= 0 ||
    parity.tolerance > 0.001 ||
    parity.maxAbsoluteError > parity.tolerance
  )
    throw new Error('The ONNX export differs from the training model.');
}

export async function executeVisionTraining(
  dataset: Dataset,
  kind: TrainingKind,
  options: TrainingOptions,
  ports: TrainingServicePorts,
): Promise<TrainingRun> {
  options = { ...options, ...(options.requirements ? { requirements: structuredClone(options.requirements) } : {}) };

  trainingStopped(options.signal);
  options.onProgress?.('Preparing images');

  const prepared = await ports.prepare(dataset, kind);
  const task = taskFor(prepared, kind, options);

  validateTrainingTask(task);

  const history = await ports.load(dataset.id);

  trainingStopped(options.signal);

  const artifacts = await ports.train(prepared, structuredClone(task), options);

  trainingStopped(options.signal);
  checkedParity(artifacts.parity);
  options.onProgress?.('Comparing models');

  const incumbent = matchingIncumbent(history, task)?.manifest ?? artifacts.baseline;
  const incumbentReport = await ports.evaluate(prepared, task, incumbent, options.signal);

  trainingStopped(options.signal);

  const report = await ports.evaluate(prepared, task, artifacts.manifest, options.signal);

  trainingStopped(options.signal);

  const id = ports.id();
  const at = ports.now();
  const comparison = compareTraining({
    id,
    at,
    candidate: report,
    incumbent: incumbentReport,
    history: history.map((run) => run.comparison),
  });
  const run: TrainingRun = {
    ...artifacts,
    version: 1,
    id,
    datasetId: dataset.id,
    datasetVersion: prepared.version.n,
    at,
    kind,
    status: comparison.status,
    reason: comparison.reason,
    comparison: comparison.attempt,
    report,
    incumbentReport,
    provenance: prepared.provenance,
  };

  trainingStopped(options.signal);
  await ports.save(run);

  return run;
}
