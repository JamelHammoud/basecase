import type { RobotJoint } from '../types/robotics';
import type { ConnectSpec, RobotSpec } from './robotState';
import { ros2Ask } from './ros2';
import { g1WritableSceneJoints, isUnitreeG1, UNITREE_G1_ASK } from './unitreeG1';

export const MAX_SERVOS = 32;

export type SceneRobot = { ok: true; spec: ConnectSpec; joints: string[] } | { ok: false; reason: string };

export interface ServoLayout {
  movable: RobotJoint[];
  ids: number[];
  class: RobotSpec['class'];
}

export function servoLayout(joints: readonly RobotJoint[]): ServoLayout {
  const movable = joints.filter((j) => j.type !== 'fixed');

  return {
    movable,
    ids: movable.map((_, i) => i + 1),
    class: movable.some((j) => j.limb === 'leg') ? 'legged' : 'arm',
  };
}

export interface ConnectChoice {
  spec: ConnectSpec;
  joints: string[];
}

export type SceneRobotChoices = { ok: true; choices: ConnectChoice[] } | { ok: false; reason: string };

function ownChoice({ movable, ids, class: robotClass }: ServoLayout): ConnectChoice {
  if (isUnitreeG1(movable)) return { spec: UNITREE_G1_ASK, joints: g1WritableSceneJoints(movable) };

  return { spec: { family: 'feetech', ids, class: robotClass, emulated: true }, joints: movable.map((j) => j.id) };
}

export function sceneRobotChoices(joints: readonly RobotJoint[]): SceneRobotChoices {
  const layout = servoLayout(joints);
  const { movable } = layout;

  if (movable.length === 0) return { ok: false, reason: 'Add a robot with joints to emulate its servos.' };

  if (movable.length > MAX_SERVOS)
    return { ok: false, reason: `Emulated robots take at most ${MAX_SERVOS} servos. This one has ${movable.length}.` };

  return { ok: true, choices: [ownChoice(layout), { spec: ros2Ask(movable), joints: movable.map((j) => j.id) }] };
}

export function sceneRobot(joints: readonly RobotJoint[]): SceneRobot {
  const robot = sceneRobotChoices(joints);

  return robot.ok ? { ok: true, ...robot.choices[0] } : robot;
}
