import { packParts } from '../three/packedMesh';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { workerClient } from '../utils/workerRpc';
import { hashFrameSetManifest, type FrameSetManifest, type VisionFrame, type VisionFrameSet } from './frameSet';
import { imageClasses, type ImageSceneInput } from './imageScene';
import { imageClassPlan, imagePlan, imageSetName } from './makeImagesPlan';

export interface MakeImagesJob extends ImageSceneInput {
  count: number;
  cameras?: string[];
  classes?: string[];
}

export interface ImageProgress {
  done: number;
  total: number;
}

export interface ImageSinks {
  onFrame: (frame: VisionFrame) => Promise<unknown> | unknown;
  onProgress?: (progress: ImageProgress) => void;
}

type ImageHandlers = typeof import('./imageRenderTasks');

export async function makeImageManifest(job: MakeImagesJob, sinks: ImageSinks): Promise<FrameSetManifest> {
  const plan = imagePlan(job);
  const classes = imageClassPlan(imageClasses(job), job.classes);
  const client = workerClient<ImageHandlers>(
    () => new Worker(new URL('../cameras/views.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('This computer can’t open an image rendering worker.');
    },
  );
  const frames: string[] = [];

  try {
    await client.call('loadImages', {
      ...job,
      parts: packParts(job.parts),
      world: packParts(job.world ?? []),
      meshes: await sourcedMeshFiles([...job.parts, ...(job.world ?? [])]),
    });
    sinks.onProgress?.({ done: 0, total: plan.length });

    for (const sample of plan) {
      const frame = await client.call('image', sample);

      await sinks.onFrame(frame);
      frames.push(frame.id);
      sinks.onProgress?.({ done: frames.length, total: plan.length });
    }

    const content = {
      format: 'basecase-vision' as const,
      version: 1 as const,
      name: imageSetName(job.kase?.name ?? 'Scene'),
      caseId: job.kase?.id ?? 'scene',
      seed: job.seed,
      classes,
      frames,
    };

    return { ...content, id: hashFrameSetManifest(content) };
  } finally {
    client.dispose();
  }
}

export async function makeImages(
  job: MakeImagesJob,
  onProgress?: ImageSinks['onProgress'],
  onFrame?: ImageSinks['onFrame'],
): Promise<VisionFrameSet> {
  const frames: VisionFrame[] = [];
  const manifest = await makeImageManifest(job, {
    onProgress,
    onFrame: async (frame) => {
      await onFrame?.(frame);
      frames.push(frame);
    },
  });

  return { ...manifest, frames };
}
