import type { RobotJoint } from '../types/robotics';
import type { ConnectSpec, RobotSpec } from './robotState';
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

export function sceneRobot(joints: readonly RobotJoint[]): SceneRobot {
  const { movable, ids, class: robotClass } = servoLayout(joints);

  if (movable.length === 0) return { ok: false, reason: 'Add a robot with joints to emulate its servos.' };

  if (movable.length > MAX_SERVOS)
    return { ok: false, reason: `Emulated robots take at most ${MAX_SERVOS} servos. This one has ${movable.length}.` };

  if (isUnitreeG1(movable)) return { ok: true, spec: UNITREE_G1_ASK, joints: g1WritableSceneJoints(movable) };

  return {
    ok: true,
    spec: {
      family: 'feetech',
      ids,
      class: robotClass,
      emulated: true,
    },
    joints: movable.map((j) => j.id),
  };
}
