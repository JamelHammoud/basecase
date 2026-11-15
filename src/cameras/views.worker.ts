/// <reference lib="webworker" />
import { visionBitmapCopier, type VisionAssignment } from './visionFrames';
import { createShotVision } from './shotVision';
import { reply, serve } from '../utils/workerRpc';
import {
  renderCameraFrame,
  renderTrainingFrame,
  loadCameraStage,
  type CameraFrameRequest,
  type CameraStageJob,
} from './cameraStage';
import type { CameraTrainingRequest } from './trainingTypes';

const vision = createShotVision(visionBitmapCopier());

serve({
  vision: ({ port, assignments }: { port: MessagePort; assignments: VisionAssignment[]; timeOrigin: number }) => {
    vision.connect(port, assignments);

    return reply(true);
  },
  close: () => {
    vision.close();

    return reply(true);
  },
  load: async (job: CameraStageJob) => reply(await loadCameraStage(job)),
  training: async (request: CameraTrainingRequest) => {
    const frame = await renderTrainingFrame(request);

    return reply(frame, [frame.jpeg.buffer, frame.instanceIds.buffer, frame.depth.buffer]);
  },
  frame: async (request: CameraFrameRequest) => {
    const bitmaps = renderCameraFrame(request);
    const results = await Promise.all(
      Object.entries(bitmaps).map(async ([key, bitmap]) => [key, await vision.infer(key, bitmap)]),
    );

    return reply({ bitmaps, vision: Object.fromEntries(results) }, Object.values(bitmaps));
  },
});
