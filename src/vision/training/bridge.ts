import { channelCall } from '../../utils/platform/channelCall';
import { electron } from '../../utils/platform/transport';
import { sha256 } from '../../cases/tries';
import { validateVisionManifest, type VisionManifest } from '../manifest';
import type { PreparedVisionTraining } from './prepare';
import type { TrainingOptions, TrainingArtifacts } from './serviceTypes';
import type { TrainingTask } from './types';
import { trainingStopped } from './serviceCore';

export const visionTrainingCall = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.visionTrainingCall, `vision-training:${channel}`, payload);

interface TrainingStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'complete' | 'failed';
  progress?: { epoch?: number; epochs?: number };
  error?: string;
}

interface Artifact {
  model: { sha256: string; bytes: number };
  baseline: { sha256: string; bytes: number };
  checkpoint: string;
  input: VisionManifest['input'];
  adapter: VisionManifest['adapter'];
  parity: TrainingArtifacts['parity'];
}

function waitForProgress(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Training stopped.'));
    };

    signal?.addEventListener('abort', abort, { once: true });

    if (signal?.aborted) abort();
  });
}

async function awaitTraining(id: string, options: TrainingOptions) {
  for (;;) {
    trainingStopped(options.signal);

    const status = await visionTrainingCall<TrainingStatus>('status', id);

    if (!status || status.state === 'failed') throw new Error(status?.error || 'The vision trainer stopped.');

    if (status.state === 'stopped') throw new Error('Training stopped.');

    if (status.state === 'complete') return;

    const progress = status.progress;

    if (progress?.epoch !== undefined) options.onProgress?.(`Epoch ${progress.epoch} of ${progress.epochs ?? 10}`);

    await waitForProgress(options.signal);
  }
}

async function trainingPayload(prepared: PreparedVisionTraining, task: TrainingTask) {
  const byFrame = new Map(prepared.samples.map((sample) => [`${sample.frameSetId}:${sample.frameId}`, sample]));
  const samples = [];
  const images = [];

  for (const set of prepared.trainingSets) {
    for (const frame of set.frames) {
      const sample = byFrame.get(`${set.id}:${frame.id}`);

      if (!sample) throw new Error('The frozen training image is missing.');

      images.push({ id: sample.content, content: sample.content, packed: true });
      samples.push({
        id: sample.content,
        split: sample.split,
        image: `images/${sample.content}.jpg`,
        width: frame.width,
        height: frame.height,
        annotations: frame.annotations,
      });
    }
  }

  const job = {
    version: 1,
    kind: task.kind,
    classes: task.classes,
    seed: prepared.dataset.seed,
    epochs: 10,
    batch: 4,
    imageSize: 128,
    device: 'auto',
    samples,
  };
  const id = await sha256(JSON.stringify({ dataset: prepared.dataset.id, version: prepared.version.hash, task, job }));

  return { id, job, images, resume: true };
}

const manifestOf = (artifact: Artifact, model: Artifact['model'], task: TrainingTask) =>
  validateVisionManifest({
    version: 1,
    id: `trained-${model.sha256.slice(0, 32)}`,
    kind: task.kind,
    adapter: artifact.adapter,
    classes: task.classes.map((category) => category.name),
    input: artifact.input,
    model: { source: 'local', ...model },
  });

export async function trainVisionBackend(
  prepared: PreparedVisionTraining,
  task: TrainingTask,
  options: TrainingOptions,
): Promise<TrainingArtifacts> {
  const payload = await trainingPayload(prepared, task);
  const stop = () => {
    void visionTrainingCall('stop', payload.id).catch(() => {});
  };

  trainingStopped(options.signal);
  options.signal?.addEventListener('abort', stop, { once: true });

  try {
    await visionTrainingCall('start', payload);

    if (options.signal?.aborted) stop();

    await awaitTraining(payload.id, options);
    trainingStopped(options.signal);

    const artifact = await visionTrainingCall<Artifact>('artifact', payload.id);

    return {
      manifest: manifestOf(artifact, artifact.model, task),
      baseline: manifestOf(artifact, artifact.baseline, task),
      jobId: payload.id,
      checkpoint: artifact.checkpoint,
      parity: artifact.parity,
    };
  } finally {
    options.signal?.removeEventListener('abort', stop);
  }
}
