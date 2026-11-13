import type { JointValues } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export interface DriveCommand {
  slot?: number;
  v: V3;
  target?: V3;
  aux?: number[];
}

export interface DriveOutput {
  values?: JointValues;
  wheels?: Record<string, number>;
}

export interface DriveHand {
  part: string;
  point: V3;
}

export interface DriveLoop {
  readonly hand?: DriveHand;

  readonly hands?: DriveHand[];

  command(c: DriveCommand, measured?: JointValues): void;

  tick(time: number): DriveOutput;
}
