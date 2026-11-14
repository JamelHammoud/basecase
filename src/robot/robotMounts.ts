import { useEffect, useEffectEvent } from 'react';
import type { CalibrationHistory } from '../reality/history';
import type { RobotJoint } from '../types/robotics';
import { connectedFrom, useCalibrationPhase, wantedMounts } from './calibrationSession';
import { robotMounts } from './mountCapture';
import { servoFamily, type RobotMount } from './robotState';
import { setRobotMounts } from './robotStore';
import { useRobot } from './useRobot';

interface RobotMountsInput {
  active: boolean;
  joints: readonly RobotJoint[];
  calibrations: Record<string, CalibrationHistory> | undefined;
}

const mountsKey = (mounts: readonly RobotMount[]) =>
  [...mounts]
    .sort((a, b) => a.id - b.id)
    .map((m) => `${m.id}:${m.zero_counts}:${m.direction}`)
    .join();

export function useRobotMounts({ active, joints, calibrations }: RobotMountsInput) {
  const robot = useRobot();
  const idle = useCalibrationPhase() === 'idle';
  const connected = robot.link === 'connected' && servoFamily(robot.spec) ? connectedFrom(joints) : null;
  const wanted = connected ? robotMounts(wantedMounts(connected, calibrations)) : [];
  const key = mountsKey(wanted);
  const differs = connected !== null && robot.calibration.length > 0 && key !== mountsKey(robot.calibration);
  const send = useEffectEvent(() => void setRobotMounts(wanted));

  useEffect(() => {
    if (active && idle && differs) send();
  }, [active, idle, differs, key]);
}
