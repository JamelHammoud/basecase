import type { SimModel } from '../sim/mjcfTypes';
import type { MeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import { LiveStage } from './liveStage';
import type { ShotVisionResult } from './shotVision';
import type { CameraView } from './views';
import type { CameraTrainingFrame, CameraTrainingRequest } from './trainingTypes';

export { LARGE_SIZE, TILE_SIZE } from './liveStage';

export interface CameraStageJob {
  parts: ScenePart[];
  world: ScenePart[];
  meshes?: MeshFiles;
  model: SimModel | null;
  views: CameraView[];
}

export interface CameraFrameRequest {
  poses: Float64Array | null;
  keys: string[];
  timestamp?: number;
}

export interface CameraFrameOutput {
  bitmaps: Record<string, ImageBitmap>;
  vision: Record<string, ShotVisionResult>;
}

let stage: LiveStage | null = null;

export async function loadCameraStage(job: CameraStageJob): Promise<boolean> {
  stage ??= new LiveStage();
  stage.setModel(job.model);
  stage.setViews(job.views);

  return stage.setScene(job.parts, job.world, job.meshes);
}

export const renderCameraFrame = (request: CameraFrameRequest): Record<string, ImageBitmap> =>
  stage?.shoot(request.poses, request.keys) ?? {};

export function renderTrainingFrame(request: CameraTrainingRequest): Promise<CameraTrainingFrame> {
  if (!stage) throw new Error('Load the scene before rendering training images.');

  return stage.training(request);
}
