import { useSyncExternalStore } from 'react';
import { benchLogs } from '../reality/benchLogs';
import { storedLogs } from '../reality/benchReplay';
import { calibrator } from '../reality/calibrateClient';
import type { ReplayLog, ServoCalibration } from '../reality/types';
import type { RobotJoint } from '../types/robotics';
import { canRunBench, playBench } from './benchRun';
import { robotSceneJoints, robotSnapshot } from './robotStore';
import { sceneRobot } from './sceneRobot';

export type CalibrationPhase = 'idle' | 'moving' | 'fitting';

export type RecordCalibration = (jointId: string, calibration: ServoCalibration, logs: ReplayLog[]) => void;

let phase: CalibrationPhase = 'idle';
const listeners = new Set<() => void>();

function setPhase(next: CalibrationPhase) {
  phase = next;

  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const calibrationPhase = () => phase;

export const useCalibrationPhase = () => useSyncExternalStore(subscribe, calibrationPhase);

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function connectedFrom(sceneJoints: readonly RobotJoint[]): string[] | null {
  const connected = robotSceneJoints();
  const robot = sceneRobot(sceneJoints);

  return connected && robot.ok && sameIds(connected, robot.joints) ? connected : null;
}

export const canCalibrate = (sceneJoints: readonly RobotJoint[]) =>
  phase === 'idle' && Boolean(connectedFrom(sceneJoints)) && canRunBench(robotSnapshot());

export async function calibrateRobot(sceneJoints: readonly RobotJoint[], record: RecordCalibration): Promise<void> {
  const joints = connectedFrom(sceneJoints);

  if (!joints || !canCalibrate(sceneJoints)) return;

  setPhase('moving');

  const fitter = calibrator();

  try {
    const recording = await playBench();

    if (!recording) return;

    setPhase('fitting');

    for (const [k, jointId] of joints.entries()) {
      const logs = benchLogs(recording, k);

      record(jointId, await fitter.calibrate({ family: recording.family, logs }), storedLogs(logs));
    }
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
