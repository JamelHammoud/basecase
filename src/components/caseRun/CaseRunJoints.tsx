import React from 'react';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint } from '../../types/robotics';
import { ConnectRobotButton } from '../operate/ConnectRobotButton';
import { RobotHeader } from '../operate/RobotHeader';
import { RobotJoints } from '../operate/RobotJoints';
import { RobotMessages } from '../operate/RobotMessages';

interface CaseRunJointsProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
}

export const CaseRunJoints: React.FC<CaseRunJointsProps> = ({ joints, onBrowseRobots }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';

  return (
    <div className="px-[8px] pt-3 pb-1">
      {connected ? (
        <RobotHeader robot={robot} />
      ) : (
        <ConnectRobotButton joints={joints} onBrowseRobots={onBrowseRobots} />
      )}
      <RobotMessages messages={robot.messages.slice(0, 1)} />
      {connected && <RobotJoints ids={robot.spec?.ids ?? []} joints={robot.status?.joints ?? []} />}
    </div>
  );
};
