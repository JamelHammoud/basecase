import { newDataset } from '../datasetFile';
import { loadDatasets, saveDataset } from '../datasetStore';
import { finalizeFrameSet, saveTrainingFrame } from '../../vision/frameSetStore';
import type { TrainingFrame } from '../../vision/frameSet';
import type { FrameSetManifest } from '../../vision/frameSetStoreTypes';
import type { ImageImportContext } from './imageImportSession';

interface ImageRun {
  prepareImages: (context: ImageImportContext) => Promise<{ manifest: FrameSetManifest; hash: string }>;
  nextImage: () => Promise<TrainingFrame> | TrainingFrame;
}

export async function keepImportedImages(run: ImageRun, context: ImageImportContext) {
  const { manifest, hash } = await run.prepareImages(context);
  const id = `dataset-${hash}`;
  const existing = (await loadDatasets()).find((dataset) => dataset.id === id);

  if (existing) return { dataset: existing, added: false };

  for (let i = 0; i < manifest.frames.length; i++) {
    await saveTrainingFrame(manifest.id, await run.nextImage(), manifest.classes);
  }

  await finalizeFrameSet(manifest);

  const dataset = newDataset({
    id,
    name: manifest.name,
    task: manifest.name,
    caseId: manifest.caseId,
    sceneId: manifest.sceneId,
    members: [],
    at: manifest.createdAt,
    imageMembers: [
      {
        frameSetId: manifest.id,
        frameIds: manifest.frames.map((frame) => frame.id),
        hash,
        classes: manifest.classes.map((category) => category.name),
      },
    ],
  });

  await saveDataset(dataset);

  return { dataset, added: true };
}
