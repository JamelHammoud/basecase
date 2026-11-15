import { caseWorldView } from '../cases/worldView';
import { newDataset, type Dataset } from '../datasets/datasetFile';
import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { workerClient } from '../utils/workerRpc';
import { frameSetManifestHash, type TrainingFrame } from './frameSet';
import { finalizeFrameSet, saveTrainingFrame, type FrameSetManifest } from './frameSetStore';
import type { LoadedTrainingJob, TrainingHeader } from './trainingImages';
import type { TrainingImagesJob } from './trainingPlan';

export { trainingImageClasses } from './trainingPlan';
export type { TrainingImagesJob } from './trainingPlan';

export interface TrainingImagesResult {
  frameSet: FrameSetManifest;
  dataset: Dataset;
  classCounts: Record<string, number>;
}

type TrainingHandlers = {
  load: (job: LoadedTrainingJob) => Promise<{ result: TrainingHeader }>;
  next: (request: null) => Promise<{ result: TrainingFrame }>;
};

async function localHandlers(): Promise<TrainingHandlers> {
  const { TrainingImageSession } = await import('./trainingImages');
  const session = new TrainingImageSession();

  return {
    load: async (job) => ({ result: await session.load(job) }),
    next: async () => ({ result: await session.next() }),
  };
}

function localSession() {
  let session: Promise<TrainingHandlers> | null = null;

  return () => {
    session ??= localHandlers();

    return session;
  };
}

const stagingId = () => `images-${crypto.randomUUID()}`;

function countClasses(frame: TrainingFrame, header: TrainingHeader, counts: Record<string, number>) {
  const byId = new Map(header.classes.map((c) => [c.id, c.name]));

  for (const annotation of frame.annotations) {
    const name = byId.get(annotation.classId);

    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }
}

async function keepDataset(frameSet: FrameSetManifest, hash: string): Promise<Dataset> {
  const id = `dataset-${hash}`;
  const existing = (await loadDatasets()).find((dataset) => dataset.id === id);

  if (existing) return existing;

  const dataset = {
    ...newDataset({
      id,
      name: frameSet.name,
      task: frameSet.name,
      sceneId: frameSet.sceneId,
      caseId: frameSet.caseId,
      members: [],
      at: frameSet.createdAt,
    }),
    imageMembers: [
      {
        frameSetId: frameSet.id,
        frameIds: frameSet.frames.map((f) => f.id),
        hash,
        classes: frameSet.classes.map((c) => c.name),
      },
    ],
  };

  await saveDataset(dataset);

  return dataset;
}

export async function makeTrainingImages(
  job: TrainingImagesJob,
  progress?: (value: { done: number; total: number }) => void,
): Promise<TrainingImagesResult> {
  const worker = workerClient<TrainingHandlers>(
    () => new Worker(new URL('./trainingImages.worker.ts', import.meta.url), { type: 'module' }),
    localSession(),
  );
  const sourceId = stagingId();

  try {
    const header = await worker.call('load', {
      ...job,
      imported: job.imported ?? caseWorldView(job.kase),
      parts: packParts(job.parts),
      rig: job.rig && { ...job.rig, parts: [] },
      world: job.world && packParts(job.world),
      meshes: await sourcedMeshFiles([...job.parts, ...(job.world ?? [])]),
    });
    const frames: FrameSetManifest['frames'] = [];
    const classCounts: Record<string, number> = Object.create(null);

    progress?.({ done: 0, total: header.count });

    for (let i = 0; i < header.count; i++) {
      const frame = await worker.call('next', null);

      await saveTrainingFrame(sourceId, frame, header.classes);
      countClasses(frame, header, classCounts);

      const { id, seed, camera, width, height, annotations } = frame;

      frames.push({ id, seed, camera, width, height, annotations });
      progress?.({ done: i + 1, total: header.count });
    }

    const manifest: FrameSetManifest = {
      version: 1,
      id: sourceId,
      name: header.name,
      caseId: header.caseId,
      sceneId: header.sceneId,
      seed: header.seed,
      classes: header.classes,
      frames,
      createdAt: new Date().toISOString(),
    };
    const hash = await frameSetManifestHash(
      manifest,
      frames.map((frame) => frame.id),
    );

    manifest.id = `frames-${hash}`;
    await finalizeFrameSet(manifest, sourceId);

    return { frameSet: manifest, dataset: await keepDataset(manifest, hash), classCounts };
  } finally {
    worker.dispose();
  }
}
