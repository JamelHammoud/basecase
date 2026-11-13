import React, { useState } from 'react';
import { Button } from '../../design-system';
import type { CalibrationHistory } from '../../reality/history';
import { canRunBench } from '../../robot/benchRun';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';
import { CalibrationReplay } from './CalibrationReplay';
import { CalibrationRow } from './CalibrationRow';

export interface CalibrationProps {
  calibrations: Record<string, CalibrationHistory> | undefined;
  onCalibrate: () => void;
  onRollBack: (jointId: string) => void;
}

interface RobotCalibrationProps extends CalibrationProps {
  robot: RobotState;
  joints: RobotJoint[];
}

interface OpenReplay {
  jointId: string;
  version: number | null;
}

export const RobotCalibration: React.FC<RobotCalibrationProps> = ({
  robot,
  joints,
  calibrations,
  onCalibrate,
  onRollBack,
}) => {
  const phase = useCalibrationPhase();
  const [replay, setReplay] = useState<OpenReplay | null>(null);
  const toggle = (jointId: string) =>
    setReplay((open) => (open?.jointId === jointId ? null : { jointId, version: null }));
  const showVersion = (jointId: string, version: number) => setReplay({ jointId, version });
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
      {rows.map(({ joint, history }) => {
        const open = replay?.jointId === joint.id ? replay : null;

        return (
          <React.Fragment key={joint.id}>
            <CalibrationRow
              jointId={joint.id}
              name={joint.name}
              history={history}
              open={Boolean(open)}
              shown={open?.version ?? null}
              onToggle={toggle}
              onShowVersion={showVersion}
              onRollBack={onRollBack}
            />
            {open && history.logs?.length ? (
              <CalibrationReplay history={history} version={open.version ?? history.active} />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
