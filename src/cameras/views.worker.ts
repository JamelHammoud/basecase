/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import {
  renderCameraFrame,
  renderTrainingFrame,
  loadCameraStage,
  type CameraFrameRequest,
  type CameraStageJob,
} from './cameraStage';
import type { CameraTrainingRequest } from './trainingTypes';

serve({
  load: async (job: CameraStageJob) => reply(await loadCameraStage(job)),
  training: async (request: CameraTrainingRequest) => {
    const frame = await renderTrainingFrame(request);

    return reply(frame, [frame.jpeg.buffer, frame.instanceIds.buffer, frame.depth.buffer]);
  },
  frame: (request: CameraFrameRequest) => {
    const frames = renderCameraFrame(request);

    return reply(frames, Object.values(frames));
  },
});
