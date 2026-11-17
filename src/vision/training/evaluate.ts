import { checkEvidenceFrameCount } from './evidence';
import { createVisionRuntime } from '../runtime';
import type { VisionManifest } from '../manifest';
import type { PreparedVisionTraining } from './prepare';
import type { TrainingPrediction, TrainingTask } from './types';
import { trainingStopped } from './serviceCore';
import { evaluationWorker } from './evaluationWorker';
import { preparationTransfer } from './prepareData';
import type { FrameSet } from '../frameSet';

export async function evaluateVisionModel(
  prepared: PreparedVisionTraining,
  task: TrainingTask,
  manifest: VisionManifest,
  signal?: AbortSignal,
) {
  const test = prepared.samples.filter(
    (sample) => sample.split === 'test' && prepared.realSourceIds.includes(sample.source),
  );

  checkEvidenceFrameCount(test.length);

  const predictions: TrainingPrediction[] = [];
  const runtime = createVisionRuntime();
  const stop = () => runtime.close();

  signal?.addEventListener('abort', stop, { once: true });

  try {
    trainingStopped(signal);

    if (test.length) await runtime.load(manifest);

    for (const sample of test) {
      trainingStopped(signal);

      const frame = prepared.sets
        .find((set) => set.id === sample.frameSetId)
        ?.frames.find((entry) => entry.id === sample.frameId);

      if (!frame) throw new Error('The frozen test image is missing.');

      const { result, inferenceMs } = await runtime.inferEncoded(manifest.id, frame.jpeg);

      predictions.push({ frameSetId: sample.frameSetId, frameId: sample.frameId, result, inferenceMs });
    }

    trainingStopped(signal);

    const testIds = new Set(test.map((sample) => `${sample.frameSetId}:${sample.frameId}`));
    const sets = prepared.sets
      .map((set) => ({ ...set, frames: set.frames.filter((frame) => testIds.has(`${set.id}:${frame.id}`)) }))
      .filter((set) => set.frames.length);
    const checked = await evaluationWorker.call(
      'evaluate',
      {
        task,
        sets,
        snapshot: prepared.samples,
        realSourceIds: prepared.realSourceIds,
        predictions,
        modelHash: manifest.model.sha256,
        modelBytes: manifest.model.bytes,
      },
      preparationTransfer(sets),
    );

    restoreEvaluationFrames(prepared.sets, checked.sets);

    return checked.report;
  } finally {
    signal?.removeEventListener('abort', stop);
    runtime.close();
  }
}

function restoreEvaluationFrames(originals: FrameSet[], restored: FrameSet[]) {
  const frames = new Map(
    restored.flatMap((set) => set.frames.map((frame) => [`${set.id}:${frame.id}`, frame] as const)),
  );

  for (const set of originals) {
    for (const frame of set.frames) {
      const restored = frames.get(`${set.id}:${frame.id}`);

      if (!restored) continue;

      frame.jpeg = restored.jpeg;
      frame.depth = restored.depth;
    }
  }
}
