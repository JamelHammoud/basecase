import React, { useState } from 'react';
import { Button, EmptyState, MetaLine, OperateIcon, RobotsIcon } from '../../design-system';
import { useRobot } from '../../robot/useRobot';
import { sceneRobot } from '../../robot/sceneRobot';
import { connectRobot, disconnectRobot, sendRobotCommand } from '../../robot/robotStore';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';
import { RobotJoints } from './RobotJoints';
import { RobotLadder, rungLabel } from './RobotLadder';
import { RobotMessages } from './RobotMessages';

export interface OperatePanelProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
}

const RUN: Record<string, string> = {
  idle: 'Motors off',
  soft_start: 'Starting motors',
  running: 'Motors running',
  rehearsing: 'Rehearsing, motors off',
  stopping: 'Stopping',
  stopped: 'Stopped',
};

const FAMILY = { feetech: 'Feetech', dynamixel: 'Dynamixel' };

const NoRobot: React.FC<{ onBrowseRobots: () => void }> = ({ onBrowseRobots }) => (
  <EmptyState
    icon={<OperateIcon className="w-5 h-5" />}
    title="No robot"
    action={
      <Button
        variant="primary"
        size="sm"
        icon={<RobotsIcon className="w-4 h-4" />}
        title="Add a robot to emulate its servos"
        onClick={onBrowseRobots}
      >
        Browse Robots
      </Button>
    }
  />
);

function ConnectButton({ joints, onBrowseRobots }: OperatePanelProps) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const robot = sceneRobot(joints);

  if (!joints.some((j) => j.type !== 'fixed')) return <NoRobot onBrowseRobots={onBrowseRobots} />;

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
      {refusal && <p className="px-1 mt-2 text-[12.5px] text-white/45">{refusal}</p>}
    </div>
  );
}

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

function RobotHeader({ robot }: { robot: RobotState }) {
  const run = robot.status?.run ?? 'idle';

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 h-8 px-1">
        <MetaLine className="text-[12.5px] text-white/45" items={[servoCount(robot)]} />
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
      <div className="px-1 text-[12.5px] text-white/45">{RUN[run] ?? run}</div>
    </div>
  );
}

export const OperatePanel: React.FC<OperatePanelProps> = ({ joints, onBrowseRobots }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="operate-panel">
      {connected ? <RobotHeader robot={robot} /> : <ConnectButton joints={joints} onBrowseRobots={onBrowseRobots} />}
      <RobotMessages messages={robot.messages} />
      {connected && <RobotLadder robot={robot} />}
      {connected && <RobotJoints ids={robot.spec?.ids ?? []} joints={robot.status?.joints ?? []} />}
    </div>
  );
};
