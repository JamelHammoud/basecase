import React from 'react';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint } from '../../types/robotics';
import { ConnectRobotButton } from './ConnectRobotButton';
import { RobotCalibration, type CalibrationProps } from './RobotCalibration';
import { RobotHeader } from './RobotHeader';
import { RobotJoints } from './RobotJoints';
import { RobotLadder } from './RobotLadder';
import { RobotMessages } from './RobotMessages';

export interface OperatePanelProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
  calibration: CalibrationProps;
}

export const OperatePanel: React.FC<OperatePanelProps> = ({ joints, onBrowseRobots, calibration }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="operate-panel">
      {connected ? (
        <RobotHeader robot={robot} />
      ) : (
        <ConnectRobotButton joints={joints} onBrowseRobots={onBrowseRobots} />
      )}
      <RobotMessages messages={robot.messages} />
      {connected && <RobotLadder robot={robot} />}
      <RobotCalibration robot={robot} joints={joints} {...calibration} />
      {connected && <RobotJoints ids={robot.spec?.ids ?? []} joints={robot.status?.joints ?? []} />}
    </div>
  );
};
