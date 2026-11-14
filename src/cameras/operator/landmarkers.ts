import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import type { Delegate, LandmarkKind } from './poseProtocol';

export type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

export interface Loaded<T> {
  landmarker: T;
  delegate: Delegate;
}

const MODELS: Record<LandmarkKind, string> = {
  body: 'pose_landmarker_lite.task',
  hand: 'hand_landmarker.task',
  face: 'face_landmarker.task',
};

const fileset = { wasmLoaderPath, wasmBinaryPath };

const baseOptions = (kind: LandmarkKind, delegate: Delegate) => ({
  modelAssetPath: new URL(`${import.meta.env.BASE_URL}models/${MODELS[kind]}`, self.location.origin).href,
  delegate,
});

function withFallback<T>(create: (delegate: Delegate) => Promise<T>): Promise<Loaded<T>> {
  const load = (delegate: Delegate) => create(delegate).then((landmarker) => ({ landmarker, delegate }));

  return load('GPU').catch(() => load('CPU'));
}

export const loadPoseLandmarker = () =>
  withFallback<PoseLandmarker>(async (delegate) => {
    const { PoseLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');

    return Landmarker.createFromOptions(fileset, {
      baseOptions: baseOptions('body', delegate),
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  });

export const loadHandLandmarker = () =>
  withFallback<HandLandmarker>(async (delegate) => {
    const { HandLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');

    return Landmarker.createFromOptions(fileset, {
      baseOptions: baseOptions('hand', delegate),
      runningMode: 'VIDEO',
      numHands: 1,
    });
  });

export const loadFaceLandmarker = () =>
  withFallback<FaceLandmarker>(async (delegate) => {
    const { FaceLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');

    return Landmarker.createFromOptions(fileset, {
      baseOptions: baseOptions('face', delegate),
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });
  });
