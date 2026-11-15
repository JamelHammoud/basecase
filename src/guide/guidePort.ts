import { provideMeshFiles } from '../three/componentMeshes';
import { renderGuide, type GuideJob, type GuideProgress, type RenderedGuide } from './renderGuide';
import type { GuidePlan } from './guideTypes';

export type GuidePortMessage =
  | { type: 'progress'; progress: GuideProgress }
  | { type: 'cover'; dataUrl: string }
  | { type: 'plan'; plan: GuidePlan }
  | { type: 'cancel' };

export async function renderGuideOnPort(job: GuideJob, port: MessagePort): Promise<RenderedGuide | null> {
  let cancelled = false;
  const send = (message: GuidePortMessage) => port.postMessage(message);

  port.onmessage = ({ data }: MessageEvent<GuidePortMessage>) => {
    if (data.type === 'cancel') cancelled = true;
  };

  provideMeshFiles(job.meshes);

  try {
    return await renderGuide(job, {
      onProgress: (progress) => send({ type: 'progress', progress }),
      onCover: (dataUrl) => send({ type: 'cover', dataUrl }),
      onPlan: (plan) => send({ type: 'plan', plan }),
      isCancelled: () => cancelled,
    });
  } finally {
    port.close();
  }
}
