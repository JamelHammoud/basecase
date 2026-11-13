/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { renderCameraFrame, loadCameraStage, type CameraFrameRequest, type CameraStageJob } from './cameraStage';

serve({
  load: async (job: CameraStageJob) => reply(await loadCameraStage(job)),
  frame: (request: CameraFrameRequest) => {
    const frames = renderCameraFrame(request);

    return reply(frames, Object.values(frames));
  },
});
