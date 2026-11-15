import { workerClient } from '../utils/workerRpc';
import { visionModel } from './catalogue';
import type { FrameSet, ImageClass, TrainingFrame } from './frameSet';
import type { VisionManifest } from './manifest';
import type { prelabelsJobs } from './prelabelsJobs';
import { createVisionRuntime } from './runtime';

const jobs = workerClient<typeof prelabelsJobs>(
  () => new Worker(new URL('./prelabels.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./prelabelsJobs')).prelabelsJobs,
);

async function prelabelFrame(options: {
  frame: TrainingFrame;
  classes: ImageClass[];
  runtime: ReturnType<typeof createVisionRuntime>;
  modelId: string;
}) {
  const { frame, classes, runtime, modelId } = options;
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(frame.jpeg)], { type: 'image/jpeg' }));

  try {
    if (bitmap.width !== frame.width || bitmap.height !== frame.height)
      throw new Error('The image frame dimensions changed.');

    const result = await runtime.infer(modelId, bitmap);

    return await jobs.call('labels', {
      classes,
      frame: { width: frame.width, height: frame.height, annotations: frame.annotations },
      result,
    });
  } finally {
    bitmap.close();
  }
}

export async function prelabelFrameSet(
  set: FrameSet,
  manifest: VisionManifest = visionModel('rfdetr-nano')!,
): Promise<FrameSet> {
  if (!set.frames.length) return set;

  const runtime = createVisionRuntime();
  const frames: TrainingFrame[] = [];
  let classes = set.classes;

  try {
    await runtime.load(manifest);

    for (const frame of set.frames) {
      const converted = await prelabelFrame({ frame, classes, runtime, modelId: manifest.id });

      classes = converted.classes;
      frames.push({ ...frame, annotations: converted.annotations });
    }

    return { ...set, classes, frames };
  } finally {
    runtime.close();
  }
}
