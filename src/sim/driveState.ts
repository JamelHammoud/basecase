import type { JointValues } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import type { DriveCommand } from './driveTypes';

export type DriveState =
  | {
      kind: 'arm';
      values: JointValues;
      goal: V3;
      aim: V3;
      command: DriveCommand;
      nextAt: number;
      side: V3;
      held: boolean;
    }
  | { kind: 'rover'; command: DriveCommand; speed: number; lastTime: number | null }
  | { kind: 'pose'; values: JointValues; goal: JointValues; out: JointValues; nextAt: number }
  | { kind: 'team'; members: Array<{ slot: number; state: DriveState }> };
