import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { workerClient } from '../utils/workerRpc';
import type { CameraFrameRequest, CameraStageJob } from './cameraStage';

type ViewHandlers = {
  load: (job: CameraStageJob) => Promise<{ result: boolean }>;
  frame: (request: CameraFrameRequest) => Promise<{ result: Record<string, ImageBitmap> }>;
};

const localHandlers = async (): Promise<ViewHandlers> => {
  const stage = await import('./cameraStage');

  return {
    load: async (job) => ({ result: await stage.loadCameraStage(job) }),
    frame: async (request) => ({ result: stage.renderCameraFrame(request) }),
  };
};

export interface CameraFeed {
  load: (job: Omit<CameraStageJob, 'meshes'>) => Promise<void>;
  frame: (request: CameraFrameRequest) => Promise<Record<string, ImageBitmap>>;
  dispose: () => void;
}

export function cameraFeed(): CameraFeed {
  const client = workerClient<ViewHandlers>(
    () => new Worker(new URL('./views.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );

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
    frame: (request) => client.call('frame', request, request.poses ? [request.poses.buffer] : []),
    dispose: () => client.dispose(),
  };
}
