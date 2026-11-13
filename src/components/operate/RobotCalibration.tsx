import React from 'react';
import { Button } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { canRunBench } from '../../robot/benchRun';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';
import { CalibrationRow } from './CalibrationRow';

export interface CalibrationProps {
  calibrations: Record<string, CalibrationHistory> | undefined;
  onCalibrate: () => void;
  onCalibrateJoint: (jointId: string) => void;
  onRollBack: (jointId: string) => void;
}

interface RobotCalibrationProps extends CalibrationProps {
  robot: RobotState;
  joints: RobotJoint[];
}

export const RobotCalibration: React.FC<RobotCalibrationProps> = ({
  robot,
  joints,
  calibrations,
  onCalibrate,
  onRollBack,
}) => {
  const phase = useCalibrationPhase();
  const rows = joints.flatMap((joint) => {
    const history = calibrations?.[joint.id];

    return history?.versions.length ? [{ joint, history }] : [];
  });
  const offered = robot.link === 'connected' && robot.mode === 'test' && Boolean(connectedFrom(joints));

  if (!offered && !rows.length) return null;

  return (
    <div className="mb-3" data-testid="robot-calibration" data-calibrating={phase}>
      {offered && (
        <Button
          variant="secondary"
          fullWidth
          className="mb-[2px]"
          disabled={phase !== 'idle' || !canRunBench(robot)}
          onClick={onCalibrate}
        >
          Calibrate Servos
        </Button>
      )}
      {rows.map(({ joint, history }) => (
        <CalibrationRow key={joint.id} jointId={joint.id} name={joint.name} history={history} onRollBack={onRollBack} />
      ))}
    </div>
  );
};
