import type { VisionResult } from '../vision/types';
import type { VisionScope } from './visionScope';

export function liveSceneVision(scope: VisionScope) {
  return {
    availableVisionCameras: () => [
      ...scope.simulated.availableVisionCameras(),
      ...scope.operator.availableVisionCameras(),
    ],
    acquireVisionCamera: (camera: string, options: Parameters<typeof scope.simulated.acquireVisionCamera>[1]) =>
      (camera === 'operator' ? scope.operator : scope.simulated).acquireVisionCamera(camera, options),
  };
}

export function sceneVisionSignals(scope: VisionScope, playback = false) {
  const sources = () => {
    const recorded = playback ? scope.playback.recordedCameraViews().map((view) => view.key) : [];

    return [
      {
        vision: scope.simulated,
        cameras: scope.simulated.availableVisionCameras().filter((key) => !recorded.includes(key)),
      },
      { vision: scope.recorded, cameras: recorded },
      { vision: scope.operator, cameras: playback ? [] : scope.operator.availableVisionCameras() },
    ];
  };

  return {
    cameraVisionSignals: (cameras: string[]) =>
      Object.assign(
        {},
        ...sources().map(({ vision, cameras: owned }) =>
          vision.cameraVisionSignals(owned.filter((camera) => cameras.includes(camera))),
        ),
      ) as Record<string, number>,
    onCameraVision: (listener: () => void) => {
      const selected = playback ? [scope.simulated, scope.recorded] : [scope.simulated, scope.operator];
      const stops = selected.map((vision) => vision.onCameraVision(listener));

      return () => stops.forEach((stop) => stop());
    },
  };
}

export function subscribeLiveSceneVision(scope: VisionScope, listener: (result: VisionResult) => void) {
  const stops = [scope.simulated, scope.operator].map((vision) => vision.subscribeVisionResult(listener));

  return () => stops.forEach((stop) => stop());
}
