import React, { useState } from 'react';
import { Button } from '../../design-system';
import { useRobot } from '../../robot/useRobot';
import { canRunBench } from '../../robot/benchRun';
import { connectedFrom, useCalibrationPhase } from '../../robot/calibrationSession';
import { sceneRobot } from '../../robot/sceneRobot';
import { jointRows } from '../../robot/jointRows';
import { connectRobot, disconnectRobot, robotConnection, sendRobotCommand } from '../../robot/robotStore';
import type { RobotState } from '../../robot/robotState';
import type { RobotJoint } from '../../types/robotics';
import { RobotCalibration, type CalibrationProps } from './RobotCalibration';
import { RobotJoints, type JointCalibrate } from './RobotJoints';
import { RobotLadder } from './RobotLadder';
import { RobotMessages } from './RobotMessages';
import { PlayNoRobot } from '../PlayNoRobot';

export interface OperatePanelProps {
  joints: RobotJoint[];
  onBrowseRobots: () => void;
  calibration: CalibrationProps;
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

function ConnectButton({ joints, onBrowseRobots }: Pick<OperatePanelProps, 'joints' | 'onBrowseRobots'>) {
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
}

function useJointCalibrate(robot: RobotState, joints: RobotJoint[], calibration: CalibrationProps) {
  const phase = useCalibrationPhase();

  if (robot.mode !== 'test' || !connectedFrom(joints)) return undefined;

  return {
    disabled: phase !== 'idle' || !canRunBench(robot),
    onCalibrate: calibration.onCalibrateJoint,
  } satisfies JointCalibrate;
}

export const OperatePanel: React.FC<OperatePanelProps> = ({ joints, onBrowseRobots, calibration }) => {
  const robot = useRobot();
  const connected = robot.link === 'connected';
  const rows = jointRows({ joints, calibrations: calibration.calibrations, connection: robotConnection(robot) });
  const calibrate = useJointCalibrate(robot, joints, calibration);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-[8px] pb-3" data-testid="operate-panel">
      {connected ? <RobotHeader robot={robot} /> : <ConnectButton joints={joints} onBrowseRobots={onBrowseRobots} />}
      <RobotMessages messages={robot.messages} />
      {connected && <RobotLadder robot={robot} />}
      <RobotCalibration robot={robot} joints={joints} onCalibrate={calibration.onCalibrate} />
      <RobotJoints rows={rows} live={connected} onRollBack={calibration.onRollBack} calibrate={calibrate} />
    </div>
  );
};
