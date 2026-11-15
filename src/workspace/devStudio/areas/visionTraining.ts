import { newDataset } from '../../../datasets/datasetFile';
import { saveDataset } from '../../../datasets/datasetStore';
import { frameSetHash, type FrameSet } from '../../../vision/frameSet';
import { saveFrameSet } from '../../../vision/frameSetStore';
import { setVisionTrainingTestPort } from '../../../vision/training/service';
import type { TrainingRun } from '../../../vision/training/serviceTypes';
import type { Studio } from '../types';

interface TrainingFixture {
  runs: TrainingRun[];
  hold?: boolean;
}

async function imageSet(): Promise<FrameSet> {
  const canvas = new OffscreenCanvas(2, 2);
  const context = canvas.getContext('2d')!;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 2, 2);

  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());

  return {
    version: 1,
    id: 'vision-training-frames',
    name: 'Cups',
    sceneId: null,
    caseId: null,
    seed: 1,
    classes: [{ id: 0, name: 'cup' }],
    createdAt: '2026-11-15T12:00:00Z',
    frames: (['train', 'validation', 'test'] as const).map((split, index) => ({
      id: `cup-${index}`,
      seed: index,
      camera: 'scene',
      width: 2,
      height: 2,
      jpeg: jpeg.slice(),
      depth: new Float32Array(4),
      annotations: [],
      source: 'import',
      split,
    })),
  };
}

export default function visionTrainingStudio(studio: Studio) {
  let release = () => {};
  const requests: { datasetId: string; kind: string }[] = [];
  const applied: { runId: string; target: unknown }[] = [];

  return {
    seedVisionTrainingDataset: async (mixed = false) => {
      const set = await imageSet();

      await saveFrameSet(set);

      const dataset = newDataset({
        id: mixed ? 'vision-mixed' : 'vision-images',
        name: 'Cups',
        task: 'Find cups',
        members: mixed ? ['recorded-try'] : [],
        at: set.createdAt,
        imageMembers: [
          {
            frameSetId: set.id,
            frameIds: set.frames.map((frame) => frame.id),
            hash: await frameSetHash(set),
            classes: ['cup'],
          },
        ],
      });

      await saveDataset(dataset);
      studio().core.triesView.openDataset(dataset.id);

      return dataset;
    },
    configureVisionTraining: ({ runs, hold }: TrainingFixture) => {
      const queue = structuredClone(runs);
      const saved: TrainingRun[] = [];

      requests.length = 0;
      applied.length = 0;
      setVisionTrainingTestPort({
        load: async (datasetId) => saved.filter((run) => run.datasetId === datasetId),
        train: async (dataset, kind, options) => {
          requests.push({ datasetId: dataset.id, kind });
          options.onProgress?.('Training model');

          if (hold)
            await new Promise<void>((resolve, reject) => {
              release = resolve;
              options.signal?.addEventListener('abort', () => reject(new Error('Stopped')), { once: true });
            });

          const next = queue.shift();

          if (!next) throw new Error('Add a controlled training result.');

          const run = { ...next, datasetId: dataset.id, kind };

          saved.push(run);

          return run;
        },
        apply: async (run, target) => {
          applied.push({ runId: run.id, target });
        },
      });
    },
    releaseVisionTraining: () => release(),
    visionTraining: () => {
      const training = studio().core.datasets.vision;

      return { busy: training.busy, datasetId: training.datasetId, runs: training.runs, requests, applied };
    },
  };
}
