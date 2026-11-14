import React from 'react';
import { Button } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';
import { calibrateButton } from './calibrateButton';

export interface CalibrationProps {
  calibrations: Record<string, CalibrationHistory> | undefined;
  measured: ReadonlySet<string>;
  onCalibrate: () => void;
  onCalibrateJoint: (jointId: string) => void;
  onRollBack: (jointId: string) => void;
}

interface RobotCalibrationProps {
  robot: RobotState;
  joints: RobotJoint[];
  onCalibrate: () => void;
}

export const RobotCalibration: React.FC<RobotCalibrationProps> = ({ robot, joints, onCalibrate }) => {
  const phase = useCalibrationPhase();
  const button = calibrateButton({ robot, phase, fromThisScene: () => Boolean(connectedFrom(joints)) });

  if (!button) return null;

  return (
    <div className="mb-3" data-testid="robot-calibration" data-calibrating={phase}>
      <Button variant="secondary" fullWidth disabled={button.disabled} onClick={onCalibrate}>
        {button.label}
      </Button>
    </div>
  );
};
