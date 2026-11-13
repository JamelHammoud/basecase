import {
  G1_FIRST_WRITABLE,
  G1_JOINT_NAMES,
  G1_WRITABLE_IDS,
  g1JointId,
  UNITREE_G1,
} from '../../electron/robot/unitreeG1.mjs';
import type { RobotJoint } from '../types/robotics';
import type { UnitreeG1Ask } from './robotState';

export { G1_JOINT_NAMES, G1_WRITABLE_IDS, g1JointId };

export const G1_LEG_JOINTS = G1_JOINT_NAMES.slice(0, G1_FIRST_WRITABLE);

export const G1_WRITABLE_JOINTS = G1_JOINT_NAMES.slice(G1_FIRST_WRITABLE);

export const UNITREE_G1_ASK: UnitreeG1Ask = { family: UNITREE_G1, emulated: true };

export function isUnitreeG1(movable: readonly RobotJoint[]): boolean {
  const names = new Set(movable.map((j) => j.name));

  return movable.length === G1_JOINT_NAMES.length && G1_JOINT_NAMES.every((name) => names.has(name));
}

export function g1WritableSceneJoints(movable: readonly RobotJoint[]): string[] {
  const idOf = new Map(movable.map((j) => [j.name, j.id]));

  return G1_WRITABLE_JOINTS.flatMap((name) => idOf.get(name) ?? []);
}
