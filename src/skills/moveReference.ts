import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation, RootOffset } from '../types/robotics';
import { sampleAnimation } from '../utils/animation';
import { MAX_REFERENCE_FRAMES, type MoveReference } from './environment';
import { kitRobot, rootHeight } from './kitModel';

export type { MoveReference } from './environment';

export const MOVE_CONTROL_DT = 0.02;

const D2R = Math.PI / 180;

const toSim = (type: 'revolute' | 'prismatic', v: number) => (type === 'revolute' ? v * D2R : v / 1000);

export const moveDuration = (animation: RobotAnimation) =>
  Math.max(animation.duration, animation.keyframes.at(-1)?.t ?? 0, MOVE_CONTROL_DT * 2);

function tiltOf(rotation: RootOffset['rotation']): number {
  const [x, y, z] = (rotation ?? [0, 0, 0]).map((d) => d * D2R);
  const up = Math.cos(x) * Math.cos(z) - Math.sin(x) * Math.sin(y) * Math.sin(z);

  return Math.acos(Math.max(-1, Math.min(1, up)));
}

export const frameCount = (animation: RobotAnimation, controlDt = MOVE_CONTROL_DT) => {
  const steps = Math.round(moveDuration(animation) / controlDt);

  return animation.loop ? Math.max(2, steps) : steps + 1;
};

export function moveReference(model: SimModel, animation: RobotAnimation): MoveReference {
  const robot = kitRobot(model);
  const byId = new Map(model.joints.map((j) => [j.id, j]));
  const height = rootHeight(model);
  const n = Math.min(frameCount(animation), MAX_REFERENCE_FRAMES);
  const frames = Array.from({ length: n }, (_, k) => {
    const pose = sampleAnimation(animation, k * MOVE_CONTROL_DT);
    const joints = robot.joints.map((id) => {
      const joint = byId.get(id)!;

      return toSim(joint.type, pose.values[id] ?? model.initial.values[id] ?? 0);
    });
    const lift = (pose.root?.position?.[1] ?? 0) / 1000;

    return [...joints, height + lift, tiltOf(pose.root?.rotation)];
  });

  return { joints: robot.joints, controlDt: MOVE_CONTROL_DT, loop: animation.loop, frames };
}

export function referencePeriodS(reference: MoveReference): number {
  const n = reference.frames.length;

  return (reference.loop ? n : n - 1) * reference.controlDt;
}

export function lowestHeight(reference: MoveReference): number {
  const at = reference.joints.length;

  return Math.min(...reference.frames.map((f) => f[at]));
}
