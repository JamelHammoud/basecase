import React, { useState } from 'react';
import { Button } from '../../design-system';
import { connectRobot } from '../../robot/robotStore';
import { sceneRobot } from '../../robot/sceneRobot';
import type { RobotJoint } from '../../types/robotics';
import { PlayNoRobot } from '../PlayNoRobot';

interface ConnectRobotButtonProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
}

export const ConnectRobotButton: React.FC<ConnectRobotButtonProps> = ({ joints, onBrowseRobots }) => {
  const [refusal, setRefusal] = useState<string | null>(null);
  const robot = sceneRobot(joints);

  if (!joints.some((j) => j.type !== 'fixed')) return <PlayNoRobot onBrowseRobots={onBrowseRobots} />;

  if (!robot.ok) return null;

  const connect = async () => {
    const reply = await connectRobot(robot.spec, robot.joints);

    setRefusal(reply.ok ? null : reply.message);
  };

  return (
    <div className="mb-3">
      <Button variant="primary" fullWidth onClick={() => void connect()}>
        Connect Emulated Robot
      </Button>
      {refusal && <p className="px-1 mt-2 text-[12.5px] text-white/50">{refusal}</p>}
    </div>
  );
};
