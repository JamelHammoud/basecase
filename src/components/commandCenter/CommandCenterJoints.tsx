import React from 'react';
import { jointRows } from '../../robot/jointRows';
import { robotConnection } from '../../robot/robotStore';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint } from '../../types/robotics';
import { ConnectRobotButton } from '../operate/ConnectRobotButton';
import { RobotHeader } from '../operate/RobotHeader';
import { RobotJoints } from '../operate/RobotJoints';
import { RobotMessages } from '../operate/RobotMessages';

interface CommandCenterJointsProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
}

export const CommandCenterJoints: React.FC<CommandCenterJointsProps> = ({ joints, onBrowseRobots }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';
  const rows = jointRows({ joints, calibrations: undefined, connection: robotConnection(robot) });

  return (
    <div className="px-[8px] pt-3 pb-1">
      {connected ? (
        <RobotHeader robot={robot} />
      ) : (
        <ConnectRobotButton joints={joints} onBrowseRobots={onBrowseRobots} />
      )}
      <RobotMessages messages={robot.messages.slice(0, 1)} />
      {connected && <RobotJoints rows={rows} live />}
    </div>
  );
};
