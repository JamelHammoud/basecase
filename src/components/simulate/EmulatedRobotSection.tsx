import React from 'react';
import { MetaLine, Section } from '../../design-system';
import { motorsCanRun } from '../../robot/robotState';
import { useRobot } from '../../robot/useRobot';
import { RobotJoints } from '../operate/RobotJoints';
import { rungLabel } from '../operate/RobotLadder';

export const EmulatedRobotSection: React.FC = () => {
  const robot = useRobot();

  if (robot.link !== 'connected') return null;

  const following = motorsCanRun(robot.mode) ? 'Follows this simulation' : 'Climb to Test to follow';
  const latest = robot.messages[0];

  return (
    <Section title="Emulated robot">
      <MetaLine className="px-1 mb-1 text-[12.5px] text-white/45" items={[rungLabel(robot.mode), following]} />
      {latest && <p className="px-1 mb-1 text-[13px] leading-snug text-white/90">{latest.text}</p>}
      <RobotJoints bare ids={robot.spec?.ids ?? []} joints={robot.status?.joints ?? []} />
    </Section>
  );
};
