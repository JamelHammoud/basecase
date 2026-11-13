import { partCameras, sceneCamera, snakeKey, uniqueKey, verticalFov, type DatasetCamera } from '../datasets/cameras';
import type { ScenePart } from '../types/robotics';
import type { FixedCamera } from './fixed';
import { horizontalDeg } from './lens';

export type CameraView = DatasetCamera & { fixed?: string };

export function fixedView(camera: FixedCamera, taken: Set<string>): CameraView {
  return {
    key: uniqueKey(snakeKey(camera.name), taken),
    label: camera.name,
    part: null,
    fixed: camera.id,
    position: camera.position,
    target: camera.target,
    up: [0, 1, 0],
    fovDeg: verticalFov(horizontalDeg(camera.lens)),
    lens: camera.lens,
  };
}

export function cameraViews(robot: ScenePart[], world: ScenePart[], fixed: FixedCamera[] = []): CameraView[] {
  if (!fixed.length) return [sceneCamera(robot, world), ...partCameras(robot)];

  const taken = new Set<string>();
  const stationary = fixed.map((c) => fixedView(c, taken));

  return [...stationary, ...partCameras(robot, taken)];
}

export const findView = (views: CameraView[], name: string): CameraView | undefined => {
  const key = snakeKey(name);

  return views.find((v) => v.key === key || v.label.toLowerCase() === name.trim().toLowerCase());
};
