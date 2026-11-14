/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { inspectedCameraFrame, loadCameraStage, type CameraFrameRequest, type CameraStageJob } from './cameraStage';

serve({
  load: async (job: CameraStageJob) => reply(await loadCameraStage(job)),
  frame: async (request: CameraFrameRequest) => {
    const frames = await inspectedCameraFrame(request);

    return reply(frames, Object.values(frames));
  },
});
