import type { RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint, uniqueJointIds } from '../utils/kinematics';
import { partBounds } from '../utils/selection';
import { centerSizeRange } from '../utils/centerSizeRange';
import type { Vec3 } from './types';

const AXES = [0, 1, 2] as const;
const ARTICULATED_GAP = 40;
const ROBOT_GAP = 100;

const DIMENSIONS = ['width', 'height', 'depth'] as const;

const axisRange = (parts: ScenePart[], axis: 0 | 1 | 2) =>
  centerSizeRange(
    parts,
    (p) => p.position[axis],
    (p) => p.dimensions[DIMENSIONS[axis]],
  );

const placedOthers = (scene: ScenePart[]) => scene.filter((p) => p.visible && p.kind !== 'image_plane');

const sceneRight = (others: ScenePart[]) =>
  others.reduce((right, p) => Math.max(right, partBounds(p).max[0]), -Infinity);

export const shiftVec = (v: Vec3, d: Vec3): Vec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];

export function articulatedShift(parts: ScenePart[], at: Vec3 | undefined, scene: ScenePart[]): Vec3 {
  const bounds = AXES.map((axis) => axisRange(parts, axis));
  const lo = bounds.map((b) => b.min);
  const hi = bounds.map((b) => b.max);

  if (at) return [at[0] - (lo[0] + hi[0]) / 2, at[1] - lo[1], at[2] - (lo[2] + hi[2]) / 2];

  const others = placedOthers(scene);

  if (!others.length) return [0, 0, 0];

  return [Math.ceil(sceneRight(others) - lo[0] + ARTICULATED_GAP), 0, 0];
}

export function importOffset(parts: ScenePart[], at: Vec3 | undefined, scene: ScenePart[]): Vec3 {
  if (at) {
    const x = axisRange(parts, 0);
    const z = axisRange(parts, 2);

    return [at[0] - (x.min + x.max) / 2, at[1], at[2] - (z.min + z.max) / 2];
  }

  const others = placedOthers(scene);

  if (!others.length) return [0, 0, 0];

  const { min: minX } = axisRange(parts, 0);

  return [Math.ceil(sceneRight(others) - minX + ROBOT_GAP), 0, 0];
}

export interface PlaceRobotInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  shift: Vec3;
  takenJointIds: string[];
  decorate?: (p: ScenePart) => ScenePart;
}

export function placeRobot({ parts, joints, shift, takenJointIds, decorate = (p) => p }: PlaceRobotInput) {
  const placed = parts.map((p) => decorate({ ...p, position: shiftVec(p.position, shift) }));
  const unique = uniqueJointIds(joints, takenJointIds);
  const anchored = unique.map((j) => anchorJoint({ ...j, origin: shiftVec(j.origin, shift) }, placed));

  return { parts: placed, joints: anchored };
}

export function palmOf(parts: ScenePart[], joints: RobotJoint[]) {
  const owned = new Set(joints.flatMap((j) => j.child));

  return parts.find((p) => !owned.has(p.id)) ?? parts[0];
}

export function robotHeightMm(parts: ScenePart[]) {
  const { min, max } = axisRange(parts, 1);

  return Math.round(max - min);
}
