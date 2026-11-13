import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import type { Delegate } from './poseProtocol';

export type { PoseLandmarker } from '@mediapipe/tasks-vision';

const MODEL_PATH = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

async function create(delegate: Delegate): Promise<{ landmarker: PoseLandmarker; delegate: Delegate }> {
  const { PoseLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');
  const landmarker = await Landmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: new URL(MODEL_PATH, self.location.origin).href, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    },
  );

  return { landmarker, delegate };
}

export const loadPoseEstimator = () => create('GPU').catch(() => create('CPU'));
