import type { RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint, uniqueJointIds } from '../utils/kinematics';
import { halfExtents } from '../utils/selection';
import type { Vec3 } from './types';

const AXES = [0, 1, 2] as const;
const ARTICULATED_GAP = 40;
const ROBOT_GAP = 100;

const sizeOf = (p: ScenePart) => [p.dimensions.width, p.dimensions.height, p.dimensions.depth];

const placedOthers = (scene: ScenePart[]) => scene.filter((p) => p.visible && p.kind !== 'image_plane');

const sceneRight = (others: ScenePart[]) => Math.max(...others.map((p) => p.position[0] + halfExtents(p)[0]));

export const shiftVec = (v: Vec3, d: Vec3): Vec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];

export function articulatedShift(parts: ScenePart[], at: Vec3 | undefined, scene: ScenePart[]): Vec3 {
  const lo = AXES.map((i) => Math.min(...parts.map((p) => p.position[i] - sizeOf(p)[i] / 2)));
  const hi = AXES.map((i) => Math.max(...parts.map((p) => p.position[i] + sizeOf(p)[i] / 2)));

  if (at) return [at[0] - (lo[0] + hi[0]) / 2, at[1] - lo[1], at[2] - (lo[2] + hi[2]) / 2];

  const others = placedOthers(scene);

  if (!others.length) return [0, 0, 0];

  return [Math.ceil(sceneRight(others) - lo[0] + ARTICULATED_GAP), 0, 0];
}

const midOf = (values: number[]) => (Math.min(...values) + Math.max(...values)) / 2;

export function importOffset(parts: ScenePart[], at: Vec3 | undefined, scene: ScenePart[]): Vec3 {
  if (at) {
    const xs = parts.flatMap((p) => [p.position[0] - p.dimensions.width / 2, p.position[0] + p.dimensions.width / 2]);
    const zs = parts.flatMap((p) => [p.position[2] - p.dimensions.depth / 2, p.position[2] + p.dimensions.depth / 2]);

    return [at[0] - midOf(xs), at[1], at[2] - midOf(zs)];
  }

  const others = placedOthers(scene);

  if (!others.length) return [0, 0, 0];

  const minX = Math.min(...parts.map((p) => p.position[0] - p.dimensions.width / 2));

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
  const ys = parts.flatMap((p) => [p.position[1] - p.dimensions.height / 2, p.position[1] + p.dimensions.height / 2]);

  return Math.round(Math.max(...ys) - Math.min(...ys));
}
