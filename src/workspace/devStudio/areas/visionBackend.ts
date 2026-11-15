import { newDataset } from '../../../datasets/datasetFile';
import { loadDatasets, saveDataset } from '../../../datasets/datasetStore';
import { saveDatasetContent } from '../../../datasets/datasetStore/content';
import { frameSetHash } from '../../../vision/frameSet';
import { saveFrameSet } from '../../../vision/frameSetStore';
import type { VisionManifest } from '../../../vision/manifest';
import { retainedVisionBindings } from '../../../vision/training/modelBindings';
import {
  loadVisionRuns,
  setVisionTrainingBackendTestPort,
  setVisionTrainingTestPort,
} from '../../../vision/training/service';
import { realTrainingImages } from '../visionBackendFixture';
import type { Studio } from '../types';

const manifest = (model: VisionManifest['model'], classes: string[]): VisionManifest => ({
  version: 1,
  id: `trained-${model.sha256.slice(0, 32)}`,
  kind: 'detect',
  adapter: 'generic',
  classes,
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  model,
});

export default function visionBackendStudio(studio: Studio) {
  return {
    configureVisionBackend: async (input: { baseline: number[]; candidate: number[] }) => {
      const baseline = new Uint8Array(input.baseline);
      const candidate = new Uint8Array(input.candidate);
      const oldHash = await saveDatasetContent(baseline);
      const newHash = await saveDatasetContent(candidate);

      setVisionTrainingTestPort();
      setVisionTrainingBackendTestPort(async (_prepared, task) => ({
        baseline: manifest(
          { source: 'local', sha256: oldHash, bytes: baseline.length },
          task.classes.map((category) => category.name),
        ),
        manifest: manifest(
          { source: 'local', sha256: newHash, bytes: candidate.length },
          task.classes.map((category) => category.name),
        ),
        jobId: 'controlled-vision-backend',
        checkpoint: newHash,
        parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
      }));
    },
    seedVisionBackendDataset: async () => {
      const set = await realTrainingImages();

      await saveFrameSet(set);

      const dataset = newDataset({
        id: 'vision-real-dataset',
        name: set.name,
        task: 'Find real cups',
        members: [],
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
      const { core } = studio();

      await saveDataset(dataset);
      core.vision.simulated.registerVisionCameras({}, ['scene']);
      core.triesView.openDataset(dataset.id);

      return dataset;
    },
    visionBackendState: async () => {
      const { core } = studio();
      const datasetId = core.triesView.dataset?.id ?? '';

      return {
        runs: await loadVisionRuns(datasetId),
        dataset: (await loadDatasets()).find((dataset) => dataset.id === datasetId),
        bindings: retainedVisionBindings(core.scene.sceneId),
        assignments: core.vision.simulated.visionAssignments(),
      };
    },
  };
}
