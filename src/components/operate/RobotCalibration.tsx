import React, { useState } from 'react';
import { Button, SectionHeader } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { canRunBench } from '../../robot/benchRun';
import { useCalibrationPhase } from '../../robot/calibrationSession';
import type { RobotState } from '../../robot/robotState';
import { robotSceneJoints } from '../../robot/robotStore';
import type { RobotJoint } from '../../types/robotics';
import { CalibrationRow, type ReplayChoice } from './CalibrationRow';

export interface CalibrationProps {
  calibrations: Record<string, CalibrationHistory> | undefined;
  onCalibrate: () => void;
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
  const [replay, setReplay] = useState<ReplayChoice | null>(null);
  const rows = joints.flatMap((joint) => {
    const history = calibrations?.[joint.id];

    return history?.versions.length ? [{ joint, history }] : [];
  });
  const offered = robot.link === 'connected' && robot.mode === 'test' && Boolean(robotSceneJoints());

  if (!offered && !rows.length) return null;

  return (
    <div className="mb-3" data-testid="robot-calibration" data-calibrating={phase}>
      <SectionHeader title="Calibration" />
      {offered && (
        <Button
          variant="secondary"
          fullWidth
          className="mb-[2px]"
          disabled={phase !== 'idle' || !canRunBench(robot)}
          title="Move each emulated joint and fit its servo"
          tooltipSide="right"
          onClick={onCalibrate}
        >
          Calibrate
        </Button>
      )}
      {rows.map(({ joint, history }) => (
        <CalibrationRow
          key={joint.id}
          jointId={joint.id}
          name={joint.name}
          history={history}
          replay={replay}
          onReplay={setReplay}
          onRollBack={onRollBack}
        />
      ))}
    </div>
  );
};
