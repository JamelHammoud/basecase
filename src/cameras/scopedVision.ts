import type { VisionAssignment } from './visionFrames';
import type { VisionResult, VisionSource } from '../vision/types';
import * as session from './visionSession';

export function scopedVision(source: VisionSource) {
  const prefix = `${source.id}/`;
  const key = (camera: string) => `${prefix}${camera}`;
  const decoded = new WeakMap<VisionResult, VisionResult>();
  const result = (value: VisionResult | null) => {
    if (!value) return null;

    let snapshot = decoded.get(value);

    if (!snapshot) {
      snapshot = { ...value, camera: value.camera?.slice(prefix.length) };
      decoded.set(value, snapshot);
    }

    return snapshot;
  };
  const signals = (cameras?: string[]) =>
    Object.fromEntries(
      Object.entries(session.cameraVisionSignals(cameras?.map(key) ?? availableVisionCameras().map(key))).map(
        ([name, value]) => [name.replace(`vision.${prefix}`, 'vision.'), value],
      ),
    );
  const availableVisionCameras = () =>
    session
      .availableVisionCameras()
      .filter((camera) => camera.startsWith(prefix))
      .map((camera) => camera.slice(prefix.length));

  return {
    source,
    onCameraVision: (listener: () => void) =>
      session.onCameraVision((camera) => {
        if (!camera || camera.startsWith(prefix)) listener();
      }),
    onVisionAssignments: (listener: () => void) =>
      session.onVisionAssignments((camera) => {
        if (!camera || camera.startsWith(prefix)) listener();
      }),
    connectVisionFrames: session.connectVisionFrames,
    availableVisionCameras,
    cameraVision: (camera: string, modelId?: string) => result(session.cameraVision(key(camera), modelId)),
    cameraVisionError: (camera: string) => session.cameraVisionError(key(camera)),
    cameraVisionSignals: signals,
    visionAssignments: (): VisionAssignment[] =>
      session
        .visionAssignments()
        .filter((a) => a.camera.startsWith(prefix))
        .map((a) => ({ ...a, camera: a.camera.slice(prefix.length), source })),
    visionNeedsFrames: (cameras: string[]) => session.visionNeedsFrames(cameras.map(key)),
    registerVisionCameras: (owner: object, cameras: string[]) => session.registerVisionCameras(owner, cameras.map(key)),
    ensureVisionCamera: (camera: string) => session.ensureVisionCamera(key(camera)),
    configureVisionCamera: (camera: string, options: Parameters<typeof session.configureVisionCamera>[1]) =>
      session.configureVisionCamera(key(camera), options),
    acquireVisionCamera: (camera: string, options: Parameters<typeof session.acquireVisionCamera>[1]) =>
      session.acquireVisionCamera(key(camera), options),
    invalidateVisionCamera: (camera: string, timestamp?: number) =>
      session.invalidateVisionCamera(key(camera), timestamp),
    setCameraVisionError: (camera: string, message: string, timestamp?: number) =>
      session.setCameraVisionError(key(camera), message, timestamp),
    publishCameraVision: (value: VisionResult) => session.publishCameraVision({ ...value, source }),
    subscribeVisionResult: (listener: (value: VisionResult) => void) =>
      session.subscribeVisionResult((value) => {
        if (value.source?.id === source.id) listener(result(value)!);
      }),
  };
}

export type CameraVision = ReturnType<typeof scopedVision>;
