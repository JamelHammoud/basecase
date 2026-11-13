import React from 'react';
import { jointRows } from '../../robot/jointRows';
import { robotConnection } from '../../robot/robotStore';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { ConnectRobotButton } from '../operate/ConnectRobotButton';
import { RobotHeader } from '../operate/RobotHeader';
import { RobotJoints } from '../operate/RobotJoints';
import { RobotMessages } from '../operate/RobotMessages';

interface CaseRunJointsProps {
  joints: RobotJoint[];
  parts: readonly ScenePart[];
  onBrowseRobots: () => void;
}

export const CaseRunJoints: React.FC<CaseRunJointsProps> = ({ joints, parts, onBrowseRobots }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';
  const rows = jointRows({ joints, parts, calibrations: undefined, connection: robotConnection(robot) });

  return (
    <div className="px-[8px] pt-3 pb-1">
      {connected ? (
        <RobotHeader robot={robot} />
      ) : (
        <ConnectRobotButton joints={joints} parts={parts} onBrowseRobots={onBrowseRobots} />
      )}
      <RobotMessages messages={robot.messages.slice(0, 1)} />
      {connected && <RobotJoints rows={rows} live />}
    </div>
  );
};
