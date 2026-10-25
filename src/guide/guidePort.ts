import { renderGuide, type GuideJob, type GuideProgress, type RenderedGuide } from './renderGuide';

export type GuidePortMessage =
  { type: 'progress'; progress: GuideProgress } | { type: 'cover'; dataUrl: string } | { type: 'cancel' };

export async function renderGuideOnPort(job: GuideJob, port: MessagePort): Promise<RenderedGuide | null> {
  let cancelled = false;
  const send = (message: GuidePortMessage) => port.postMessage(message);

  port.onmessage = ({ data }: MessageEvent<GuidePortMessage>) => {
    if (data.type === 'cancel') cancelled = true;
  };

  try {
    return await renderGuide(job, {
      onProgress: (progress) => send({ type: 'progress', progress }),
      onCover: (dataUrl) => send({ type: 'cover', dataUrl }),
      isCancelled: () => cancelled,
    });
  } finally {
    port.close();
  }
}
