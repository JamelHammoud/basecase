import React from 'react';
import { canRunBench } from '../../robot/benchRun';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import { jointRows } from '../../robot/jointRows';
import { robotConnection } from '../../robot/robotStore';
import type { RobotState } from '../../robot/robotState';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint } from '../../types/robotics';
import { ConnectRobotButton } from './ConnectRobotButton';
import { RobotCalibration, type CalibrationProps } from './RobotCalibration';
import { RobotHeader } from './RobotHeader';
import { RobotJoints, type JointCalibrate } from './RobotJoints';
import { RobotLadder } from './RobotLadder';
import { RobotMessages } from './RobotMessages';
import { ServoSetupSection } from './ServoSetupSection';

export interface OperatePanelProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
  calibration: CalibrationProps;
  onSetUpServos: () => void;
}

function useJointCalibrate(robot: RobotState, joints: RobotJoint[], calibration: CalibrationProps) {
  const phase = useCalibrationPhase();

  if (robot.mode !== 'test' || !connectedFrom(joints)) return undefined;

  return {
    disabled: phase !== 'idle' || !canRunBench(robot),
    onCalibrate: calibration.onCalibrateJoint,
  } satisfies JointCalibrate;
}

export const OperatePanel: React.FC<OperatePanelProps> = ({ joints, onBrowseRobots, calibration, onSetUpServos }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';
  const rows = jointRows({ joints, calibrations: calibration.calibrations, connection: robotConnection(robot) });
  const calibrate = useJointCalibrate(robot, joints, calibration);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="operate-panel">
      {connected ? (
        <RobotHeader robot={robot} />
      ) : (
        <ConnectRobotButton joints={joints} onBrowseRobots={onBrowseRobots} />
      )}
      <ServoSetupSection robot={robot} joints={joints} onSetUp={onSetUpServos} />
      <RobotMessages messages={robot.messages} />
      {connected && <RobotLadder robot={robot} />}
      <RobotCalibration robot={robot} joints={joints} onCalibrate={calibration.onCalibrate} />
      <RobotJoints rows={rows} live={connected} onRollBack={calibration.onRollBack} calibrate={calibrate} />
    </div>
  );
};
