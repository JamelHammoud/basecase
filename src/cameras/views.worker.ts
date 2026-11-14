/// <reference lib="webworker" />
import type { ImageSceneJob, ImageSample } from '../vision/imageRenderTasks';
import { reply, serve } from '../utils/workerRpc';
import { renderCameraFrame, loadCameraStage, type CameraFrameRequest, type CameraStageJob } from './cameraStage';

serve({
  loadImages: async (job: ImageSceneJob) => (await import('../vision/imageRenderTasks')).loadImages(job),
  image: async (sample: ImageSample) => (await import('../vision/imageRenderTasks')).image(sample),
  load: async (job: CameraStageJob) => reply(await loadCameraStage(job)),
  frame: (request: CameraFrameRequest) => {
    const frames = renderCameraFrame(request);

    return reply(frames, Object.values(frames));
  },
});
