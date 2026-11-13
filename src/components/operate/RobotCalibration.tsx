import React from 'react';
import { Button } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { canRunBench } from '../../robot/benchRun';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';

export interface CalibrationProps {
  calibrations: Record<string, CalibrationHistory> | undefined;
  onCalibrate: () => void;
  onRollBack: (jointId: string) => void;
}

interface RobotCalibrationProps {
  robot: RobotState;
  joints: RobotJoint[];
  onCalibrate: () => void;
}

export const RobotCalibration: React.FC<RobotCalibrationProps> = ({ robot, joints, onCalibrate }) => {
  const phase = useCalibrationPhase();
  const offered = robot.link === 'connected' && robot.mode === 'test' && Boolean(connectedFrom(joints));

  if (!offered) return null;

  return (
    <div className="mb-3" data-testid="robot-calibration" data-calibrating={phase}>
      <Button variant="secondary" fullWidth disabled={phase !== 'idle' || !canRunBench(robot)} onClick={onCalibrate}>
        Calibrate Servos
      </Button>
    </div>
  );
};
