import type { JointValues } from '../types/robotics';
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

  private goal: JointValues;

  private nextAt = 0;

  constructor(setup: PoseSetup) {
    this.setup = setup;
    this.values = Object.fromEntries(setup.joints.map((j) => [j.id, clamp(setup.start[j.id] ?? 0, j.range)]));
    this.goal = { ...this.values };
  }

  command(c: DriveCommand) {
    if (!c.joints) return;

    for (const j of this.setup.joints) {
      const want = c.joints[j.id];

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
