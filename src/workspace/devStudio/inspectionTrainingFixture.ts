import type { Dataset } from '../../datasets/datasetFile';
import { evaluateTraining } from '../../vision/training/metrics';
import { prepareVisionTraining } from '../../vision/training/prepare';
import { saveVisionRun, storedVisionRuns } from '../../vision/training/runStore';
import { executeVisionTraining } from '../../vision/training/serviceCore';
import type { TrainingServicePorts } from '../../vision/training/serviceTypes';

export function trainInspectionFixture(dataset: Dataset, train: TrainingServicePorts['train']) {
  let candidateHash = '';

  return executeVisionTraining(
    dataset,
    'detect',
    {},
    {
      prepare: prepareVisionTraining,
      train: async (prepared, task, options) => {
        const artifacts = await train(prepared, task, options);

        candidateHash = artifacts.manifest.model.sha256;

        return artifacts;
      },
      evaluate: (prepared, task, model) =>
        evaluateTraining({
          task,
          sets: prepared.sets,
          snapshot: prepared.samples,
          realSourceIds: prepared.realSourceIds,
          modelHash: model.model.sha256,
          modelBytes: model.model.bytes,
          predictions: prepared.samples
            .filter((sample) => sample.split === 'test' && prepared.realSourceIds.includes(sample.source))
            .map((sample) => ({
              frameSetId: sample.frameSetId,
              frameId: sample.frameId,
              inferenceMs: 1,
              result: {
                modelId: model.id,
                timestamp: 0,
                width: 2,
                height: 2,
                detections:
                  model.model.sha256 === candidateHash
                    ? [{ label: task.classes[0].name, score: 0.9, box: [0, 0, 1, 1] }]
                    : [],
              },
            })),
        }),
      load: storedVisionRuns,
      save: saveVisionRun,
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID(),
    },
  );
}
