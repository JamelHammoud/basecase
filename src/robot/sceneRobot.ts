import type { RobotJoint } from '../types/robotics';
import type { RobotSpec } from './robotState';

export const MAX_SERVOS = 32;

export type SceneRobot = { ok: true; spec: RobotSpec; joints: string[] } | { ok: false; reason: string };

export function sceneRobot(joints: readonly RobotJoint[]): SceneRobot {
  const movable = joints.filter((j) => j.type !== 'fixed');

  if (movable.length === 0) return { ok: false, reason: 'Add a robot with joints to emulate its servos.' };

  if (movable.length > MAX_SERVOS)
    return { ok: false, reason: `Emulated robots take at most ${MAX_SERVOS} servos. This one has ${movable.length}.` };

  return {
    ok: true,
    spec: {
      family: 'feetech',
      ids: movable.map((_, i) => i + 1),
      class: movable.some((j) => j.limb === 'leg') ? 'legged' : 'arm',
      emulated: true,
    },
    joints: movable.map((j) => j.id),
  };
}
