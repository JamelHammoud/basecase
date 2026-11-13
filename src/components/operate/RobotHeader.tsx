import React from 'react';
import { Button, MetaLine } from '../../design-system';
import { disconnectRobot, sendRobotCommand } from '../../robot/robotStore';
import type { RobotState } from '../../robot/robotState';
import { rungLabel } from './RobotLadder';

const RUN: Record<string, string> = {
  idle: 'Motors off',
  soft_start: 'Starting motors',
  running: 'Motors running',
  rehearsing: 'Rehearsing, motors off',
  stopping: 'Stopping',
  stopped: 'Stopped',
};

const FAMILY = { feetech: 'Feetech', dynamixel: 'Dynamixel' };

function servoCount(robot: RobotState) {
  const n = robot.spec?.ids.length ?? 0;
  const family = FAMILY[robot.spec?.family ?? 'feetech'];

  return `${n} emulated ${family} ${n === 1 ? 'servo' : 'servos'}`;
}

function RobotAction({ robot }: { robot: RobotState }) {
  const run = robot.status?.run;

  if (run === 'running' || run === 'soft_start')
    return (
      <Button size="xs" variant="secondary" onClick={() => void sendRobotCommand({ cmd: 'stop' })}>
        Stop
      </Button>
    );

  if (robot.status?.fault_latched && robot.mode === 'look')
    return (
      <Button size="xs" variant="secondary" onClick={() => void sendRobotCommand({ cmd: 'clear_fault' })}>
        Clear Fault
      </Button>
    );

  return null;
}

export const RobotHeader: React.FC<{ robot: RobotState }> = ({ robot }) => {
  const run = robot.status?.run ?? 'idle';

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 h-8 px-1">
        <MetaLine className="text-[12.5px] text-white/50" items={[servoCount(robot)]} />
        <Button size="xs" variant="ghost" onClick={() => void disconnectRobot()}>
          Disconnect
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <div data-testid="robot-mode" data-mode={robot.mode} className="text-[17px] font-semibold text-white/90">
          {rungLabel(robot.mode)}
        </div>
        <RobotAction robot={robot} />
      </div>
      <div className="px-1 text-[12.5px] text-white/50">{RUN[run] ?? run}</div>
    </div>
  );
};
