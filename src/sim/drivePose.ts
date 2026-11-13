import type { JointValues } from '../types/robotics';
import { isMovable, type Rig } from '../utils/kinematics';
import { autoMapRobot } from '../utils/mocapBones';
import { CONTROL_DT } from './driveTiming';
import type { DriveCommand, DriveLoop, DriveOutput } from './driveTypes';

export interface PoseJoint {
  id: string;
  range: [number, number] | null;
}

export interface PoseSetup {
  kind: 'pose';
  robot: string;
  joints: PoseJoint[];
  start: JointValues;
  rate: number;
}

export const POSE_RATE_PER_SECOND = 240;

const ARMS = [
  ['leftShoulder', 'leftElbow'],
  ['rightShoulder', 'rightElbow'],
] as const;

export function hasArms(rig: Rig): boolean {
  const map = autoMapRobot(rig);

  return ARMS.some(([shoulder, elbow]) => !!map[shoulder] && !!map[elbow]);
}

export function poseJoints(rig: Rig, robot?: string): PoseJoint[] {
  const map = autoMapRobot(rig);
  const hips = [map.leftHip, map.rightHip].filter((id): id is string => !!id);
  const isLeg = (id: string) => hips.some((hip) => rig.chain.get(id)?.has(hip));

  return rig.joints
    .filter((j) => isMovable(j) && (!robot || rig.robotOf.get(j.id) === robot))
    .filter((j) => j.limb !== 'leg' && !isLeg(j.id))
    .map((j) => ({ id: j.id, range: j.range ?? null }));
}

export function poseSetup(rig: Rig, options: { robot: string; start?: JointValues }): PoseSetup {
  const joints = poseJoints(rig, options.robot);
  const start = Object.fromEntries(joints.map((j) => [j.id, options.start?.[j.id] ?? 0]));

  return { kind: 'pose', robot: options.robot, joints, start, rate: POSE_RATE_PER_SECOND };
}

const within = (value: number, range: [number, number] | null) =>
  range ? Math.min(Math.max(value, Math.min(...range)), Math.max(...range)) : value;

const toward = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, to - from));

export class PoseDrive implements DriveLoop {
  private readonly setup: PoseSetup;

  private readonly values: JointValues;

  private readonly goal: JointValues;

  private out: JointValues;

  private nextAt = 0;

  constructor(setup: PoseSetup) {
    this.setup = setup;
    this.values = { ...setup.start };
    this.goal = { ...setup.start };
    this.out = { ...setup.start };
  }

  command(c: DriveCommand) {
    if (!c.joints) return;

    for (const { id, range } of this.setup.joints) {
      const value = c.joints[id];

      if (value !== undefined && Number.isFinite(value)) this.goal[id] = within(value, range);
    }
  }

  tick(time: number): DriveOutput {
    if (time < this.nextAt - 1e-9) return { values: this.out };

    this.nextAt = time + CONTROL_DT;

    const step = this.setup.rate * CONTROL_DT;

    for (const { id } of this.setup.joints) this.values[id] = toward(this.values[id] ?? 0, this.goal[id] ?? 0, step);

    this.out = { ...this.values };

    return { values: this.out };
  }
}
