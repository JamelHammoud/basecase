import React from 'react';
import { MetaLine, Section } from '../../design-system';
import { motorsCanRun } from '../../robot/robotState';
import { jointRows } from '../../robot/jointRows';
import { robotConnection } from '../../robot/robotStore';
import { useRobot } from '../../robot/useRobot';
import type { RobotJoint } from '../../types/robotics';
import { RobotJoints } from '../operate/RobotJoints';
import { rungLabel } from '../operate/RobotLadder';

export const EmulatedRobotSection: React.FC<{ joints: RobotJoint[] }> = ({ joints }) => {
  const robot = useRobot();
  const connection = robotConnection(robot);

  if (!connection) return null;

  const following = motorsCanRun(robot.mode) ? 'Follows this simulation' : 'Climb to Test to follow';
  const latest = robot.messages[0];

  return (
    <Section title="Emulated robot">
      <MetaLine className="px-1 mb-1 text-[12.5px] text-white/50" items={[rungLabel(robot.mode), following]} />
      {latest && <p className="px-1 mb-1 text-[13px] leading-snug text-white/90">{latest.text}</p>}
      <RobotJoints bare live rows={jointRows({ joints, calibrations: undefined, connection })} />
    </Section>
  );
};
