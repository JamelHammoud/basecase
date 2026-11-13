import type { InputRobot } from '../../sim/inputTypes';
import type { JointValues } from '../../types/robotics';
import type { V3 } from '../../utils/kinematics';
import { createRetargeter } from '../../utils/retargeter';
import { createKeypointSmoother, createOneEuro } from './oneEuro';
import { humanFrame, pinch, type PoseLandmark } from './poseLandmarks';
import { pointOfTable } from './pointTable';
import { createTipFollow } from './tipFollow';

export interface PoseSample {
  t: number;
  world: PoseLandmark[];
  image?: PoseLandmark[];
}

export interface PoseFollow {
  joints?: JointValues;
  target?: V3;
  grip: number;
}

export interface PoseFollower {
  step: (sample: PoseSample) => PoseFollow | null;
}

type Frame = Record<string, V3>;

const LOWER_LEG = /Knee|Ankle|Toe/;

const upperBody = (frame: Frame): Frame =>
  Object.fromEntries(Object.entries(frame).filter(([key]) => !LOWER_LEG.test(key)));

function jointFollow(robot: Extract<InputRobot, { kind: 'joints' }>) {
  const retargeter = createRetargeter({ rig: robot.rig, pointOf: pointOfTable(robot.points), upperBody: true });

  return (frame: Frame, tSeconds: number): Pick<PoseFollow, 'joints'> | null => {
    const step = retargeter.step(upperBody(frame), tSeconds);

    if (!step) return null;

    const joints: JointValues = {};

    for (const id of robot.joints) {
      const value = step.values[id];

      if (value !== undefined && Number.isFinite(value)) joints[id] = value;
    }

    return { joints };
  };
}

function tipFollow(robot: Extract<InputRobot, { kind: 'tip' }>) {
  const follow = createTipFollow(robot);

  return (frame: Frame): Pick<PoseFollow, 'target'> | null => {
    const target = follow(frame);

    return target ? { target } : null;
  };
}

export function createPoseFollower(robot: InputRobot): PoseFollower {
  const smoother = createKeypointSmoother();
  const grip = createOneEuro();
  const follow = robot.kind === 'joints' ? jointFollow(robot) : tipFollow(robot);

  return {
    step: (sample) => {
      const tSeconds = sample.t / 1000;
      const frame = smoother.filter(humanFrame(sample.world), tSeconds);
      const out = follow(frame, tSeconds);
      const closed = Math.min(1, Math.max(0, grip(pinch(sample.world), tSeconds)));

      return out ? { ...out, grip: closed } : null;
    },
  };
}
