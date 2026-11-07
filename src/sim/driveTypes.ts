import type { JointValues } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export interface DriveCommand {
  v: V3;
  target?: V3;
  aux?: number[];
}

export interface DriveOutput {
  values?: JointValues;
  wheels?: Record<string, number>;
}

export interface DriveLoop {
  command(c: DriveCommand): void;

  tick(time: number): DriveOutput;
}
