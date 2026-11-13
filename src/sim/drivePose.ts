import type { JointValues } from '../types/robotics';
import { gripValues, type ArmGrip } from './driveGrip';
import type { PolicySpec } from './policy';
import type { DriveCommand, DriveLoop, DriveOutput } from './driveTypes';

export interface PoseJoint {
  id: string;
  range: [number, number];
  prismatic?: boolean;
}

export interface PoseSetup {
  kind: 'pose';
  robot: string;
  joints: PoseJoint[];
  start: JointValues;
  jaws?: ArmGrip['jaws'];
  under?: { policy: PolicySpec; robot: string };
}

export const POSE_DT = 0.02;
export const POSE_DEG_PER_S = 240;
export const POSE_MM_PER_S = 250;

const clamp = (x: number, [lo, hi]: [number, number]) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), x));

const stepToward = (from: number, to: number, most: number) => from + Math.max(-most, Math.min(most, to - from));

export class PoseDrive implements DriveLoop {
  private readonly setup: PoseSetup;

  private readonly values: JointValues;

  private readonly rest: JointValues;

  private readonly jaws: Set<string>;

  private goal: JointValues;

  private nextAt = 0;

  constructor(setup: PoseSetup) {
    this.setup = setup;
    this.values = Object.fromEntries(setup.joints.map((j) => [j.id, clamp(setup.start[j.id] ?? 0, j.range)]));
    this.rest = { ...this.values };
    this.jaws = new Set(setup.jaws?.map((j) => j.joint));
    this.goal = { ...this.values };
  }

  command(c: DriveCommand) {
    const grip = c.aux?.[1];
    const { jaws } = this.setup;
    const jawGoals = grip !== undefined && jaws ? gripValues({ jaws }, grip, this.rest) : {};

    for (const j of this.setup.joints) {
      const want = this.jaws.has(j.id) ? jawGoals[j.id] : c.joints?.[j.id];

      if (want !== undefined && Number.isFinite(want)) this.goal[j.id] = clamp(want, j.range);
    }
  }

  tick(time: number): DriveOutput {
    if (time < this.nextAt - 1e-9) return { values: { ...this.values } };

    this.nextAt = time + POSE_DT;

    for (const j of this.setup.joints) {
      const most = (j.prismatic ? POSE_MM_PER_S : POSE_DEG_PER_S) * POSE_DT;

      this.values[j.id] = stepToward(this.values[j.id], this.goal[j.id], most);
    }

    return { values: { ...this.values } };
  }
}
