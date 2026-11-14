import { simDeltas, worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import { framePoses, type Recording } from '../sim/recorder';
import type { MeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import { FRAME_HEIGHT, FRAME_WIDTH, type DatasetCamera } from './cameras';
import { applyDeltas, createRenderStage, disposeRenderStage, renderView } from './renderVideos';

export const FRAME_EDGE = 256;

export interface TryFramesJob {
  parts: ScenePart[];
  world: ScenePart[];
  meshes?: MeshFiles;
  model: SimModel;
  recording: Recording;
  camera: DatasetCamera;
  size?: number;
}

export interface TryFrame {
  at: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function secondFrames(recording: Recording): Array<{ at: number; frame: number }> {
  if (recording.frames < 1 || recording.dt <= 0) return [];

  const seconds = Math.floor((recording.frames - 1) * recording.dt);

  return Array.from({ length: seconds + 1 }, (_, at) => ({
    at,
    frame: Math.min(recording.frames - 1, Math.round(at / recording.dt)),
  }));
}

export async function renderTryFrames(job: TryFramesJob): Promise<TryFrame[]> {
  const height = job.size ?? FRAME_EDGE;
  const width = Math.round((height * FRAME_WIDTH) / FRAME_HEIGHT);
  const stage = await createRenderStage(job.parts, job.world, job.meshes, [width, height]);
  const canvas = stage.renderer.domElement as unknown as OffscreenCanvas;
  const reader = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
  const frames: TryFrame[] = [];

  try {
    for (const { at, frame } of secondFrames(job.recording)) {
      const poses = framePoses(job.recording, frame);
      const deltas = simDeltas(job.model, poses);

      applyDeltas(stage.parts, deltas);
      applyDeltas(stage.world, worldDeltas(job.model, poses));
      renderView(stage, job.camera, job.camera.part ? deltas.get(job.camera.part) : undefined);
      reader.clearRect(0, 0, width, height);
      reader.drawImage(canvas, 0, 0);
      frames.push({ at, width, height, data: reader.getImageData(0, 0, width, height).data });
    }
  } finally {
    disposeRenderStage(stage);
  }

  return frames;
}
