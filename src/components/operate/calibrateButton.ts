import { canRunBench } from '../../robot/benchRun';
import type { CalibrationPhase } from '../../robot/calibrationSession';
import { servoFamily, type RobotState } from '../../robot/robotState';

export interface CalibrateButtonInput {
  robot: RobotState;
  phase: CalibrationPhase;
  fromThisScene: () => boolean;
}

export interface CalibrateButton {
  label: string;
  disabled: boolean;
}

const offered = ({ robot, fromThisScene }: CalibrateButtonInput) =>
  robot.link === 'connected' && robot.mode === 'test' && servoFamily(robot.spec) !== null && fromThisScene();

export function calibrateButton(input: CalibrateButtonInput): CalibrateButton | null {
  if (!offered(input)) return null;

  if (input.phase !== 'idle') return { label: 'Calibrating…', disabled: true };

  return canRunBench(input.robot) ? { label: 'Calibrate Servos', disabled: false } : null;
}
