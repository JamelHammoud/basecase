import { PoseLandmarker } from '@mediapipe/tasks-vision';
import loaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import type { PoseLandmark } from './landmarks';

export const POSE_MODEL = 'models/pose_landmarker_full.task';

export interface Estimate {
  world: PoseLandmark[];
  image: PoseLandmark[];
}

export interface Estimator {
  detect: (frame: TexImageSource, ms: number) => Estimate | null;
  close: () => void;
}

const modelUrl = () => new URL(`${import.meta.env.BASE_URL}${POSE_MODEL}`, self.location.href).href;

export async function loadEstimator(): Promise<Estimator> {
  const landmarker = await PoseLandmarker.createFromOptions(
    { wasmLoaderPath: loaderUrl, wasmBinaryPath: wasmUrl },
    { baseOptions: { modelAssetPath: modelUrl(), delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 },
  );
  let last = -1;

  return {
    detect: (frame, ms) => {
      const at = Math.max(ms, last + 1);

      last = at;

      const result = landmarker.detectForVideo(frame, at);
      const world = result.worldLandmarks[0];
      const image = result.landmarks[0];

      return world && image ? { world, image } : null;
    },
    close: () => landmarker.close(),
  };
}
