import { loadPoseLandmarker, type PoseLandmarker } from '../cameras/operator/landmarkers';
import type { VisionBackend, VisionResult } from './protocol';
import { poseVisionResult } from './poseResult';

let landmarker: PoseLandmarker | null = null;
let loading: Promise<{ backend: VisionBackend }> | null = null;
let timestamp = 0;
let generation = 0;

export function loadPoseVision(): Promise<{ backend: VisionBackend }> {
  const ticket = generation;

  loading ??= loadPoseLandmarker()
    .then((loaded): { backend: VisionBackend } => {
      if (ticket !== generation) {
        loaded.landmarker.close();

        throw new Error('The camera is closed.');
      }

      landmarker = loaded.landmarker;

      return { backend: loaded.delegate === 'GPU' ? 'webgpu' : 'wasm' };
    })
    .catch((error: unknown) => {
      if (ticket === generation) loading = null;

      throw error;
    });

  return loading;
}

export async function inferPoseVision(
  image: ImageBitmap,
  metadata: { camera: string; timestamp: number },
): Promise<VisionResult> {
  await loadPoseVision();

  if (!landmarker) throw new Error('Couldn’t open the camera.');

  timestamp = Math.max(performance.now(), timestamp + 1);

  const start = performance.now();
  const result = landmarker.detectForVideo(image, timestamp);

  return poseVisionResult(result.landmarks[0] ?? [], {
    ...metadata,
    width: image.width,
    height: image.height,
    elapsedMs: performance.now() - start,
  });
}

export function disposePoseVision(): void {
  generation++;
  landmarker?.close();
  landmarker = null;
  loading = null;
}
