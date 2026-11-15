import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { workerClient } from '../utils/workerRpc';
import * as defaultVision from './visionSession';
import type { CameraVision } from './scopedVision';
import type { VisionAssignment } from './visionFrames';
import type { CameraFrameRequest, CameraFrameOutput, CameraStageJob } from './cameraStage';
import type { CameraTrainingFrame, CameraTrainingRequest } from './trainingTypes';

type ViewHandlers = {
  vision: (input: {
    port: MessagePort;
    assignments: VisionAssignment[];
    timeOrigin: number;
  }) => Promise<{ result: boolean }>;
  close: (input: null) => Promise<{ result: boolean }>;
  load: (job: CameraStageJob) => Promise<{ result: boolean }>;
  frame: (request: CameraFrameRequest) => Promise<{ result: CameraFrameOutput }>;
  training: (request: CameraTrainingRequest) => Promise<{ result: CameraTrainingFrame }>;
};

const localHandlers = async (): Promise<ViewHandlers> => {
  const stage = await import('./cameraStage');

  return {
    vision: async ({ port }) => {
      port.close();

      return { result: false };
    },
    close: async () => ({ result: true }),
    load: async (job) => ({ result: await stage.loadCameraStage(job) }),
    frame: async (request) => ({ result: { bitmaps: await stage.renderCameraFrame(request), vision: {} } }),
    training: async (request) => ({ result: await stage.renderTrainingFrame(request) }),
  };
};

export interface CameraFeed {
  load: (job: Omit<CameraStageJob, 'meshes'>) => Promise<void>;
  frame: (request: CameraFrameRequest) => Promise<CameraFrameOutput>;
  training: (request: CameraTrainingRequest) => Promise<CameraTrainingFrame>;
  dispose: () => void;
}

export function cameraFeed(
  vision: Pick<CameraVision, 'connectVisionFrames' | 'ensureVisionCamera' | 'visionAssignments'> = defaultVision,
): CameraFeed {
  const { connectVisionFrames, ensureVisionCamera, visionAssignments } = vision;
  const client = workerClient<ViewHandlers>(
    () => new Worker(new URL('./views.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );

  let connected = false;

  return {
    load: async (job) => {
      const all = [...job.parts, ...job.world];

      await client.call('load', {
        ...job,
        parts: packParts(job.parts),
        world: packParts(job.world),
        meshes: await sourcedMeshFiles(all),
      });
    },
    frame: async (request) => {
      if (typeof Worker !== 'undefined' && !connected) {
        await Promise.all(request.keys.map((key) => ensureVisionCamera(key).catch(() => undefined)));

        const port = await connectVisionFrames();

        await client.call('vision', { port, assignments: visionAssignments(), timeOrigin: performance.timeOrigin }, [
          port,
        ]);
        connected = true;
      }

      return client.call('frame', request, request.poses ? [request.poses.buffer] : []);
    },
    training: (request) => client.call('training', request, request.poses ? [request.poses.buffer] : []),
    dispose: () => {
      void client.call('close', null).then(
        () => client.dispose(),
        () => client.dispose(),
      );
    },
  };
}
