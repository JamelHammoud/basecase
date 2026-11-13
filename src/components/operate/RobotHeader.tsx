import React from 'react';
import { Button } from '../../design-system';
import { disconnectRobot, sendRobotCommand } from '../../robot/robotStore';
import type { RobotFamily, RobotState } from '../../robot/robotState';

const RUN: Record<string, string> = {
  idle: 'Motors off',
  soft_start: 'Starting motors',
  running: 'Motors running',
  rehearsing: 'Rehearsing, motors off',
  stopping: 'Stopping',
  stopped: 'Stopped',
};

const FAMILY: Record<RobotFamily, string> = { feetech: 'Feetech', dynamixel: 'Dynamixel', 'unitree-g1': 'G1' };

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
    <div className="flex items-center justify-between gap-2 min-h-8 px-1 py-1 mb-1">
      <span className="min-w-0 flex flex-wrap gap-x-[12px] text-[12.5px] text-white/50">
        <span>{servoCount(robot)}</span>
        <span>{RUN[run] ?? run}</span>
      </span>
      <span className="shrink-0 flex items-center gap-1">
        <RobotAction robot={robot} />
        <Button size="xs" variant="ghost" onClick={() => void disconnectRobot()}>
          Disconnect
        </Button>
      </span>
    </div>
  );
};
