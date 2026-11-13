import { useSyncExternalStore } from 'react';
import { benchLogs } from '../reality/benchLogs';
import { keepBenchLogs } from '../reality/benchLogStore';
import { calibrator } from '../reality/calibrateClient';
import type { ServoCalibration } from '../reality/types';
import type { RobotJoint } from '../types/robotics';
import { canRunBench, playBench } from './benchRun';
import { robotSceneJoints, robotSnapshot } from './robotStore';
import { forgetLag } from './robotTwin';
import { sceneRobot } from './sceneRobot';

export type CalibrationPhase = 'idle' | 'moving' | 'fitting';

export type RecordCalibration = (jointId: string, calibration: ServoCalibration) => void;

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

export async function calibrateRobot(
  sceneJoints: readonly RobotJoint[],
  record: RecordCalibration,
  only?: readonly string[],
): Promise<void> {
  const joints = connectedFrom(sceneJoints);

  if (!joints || !canCalibrate(sceneJoints)) return;

  const subset = joints.map((_, k) => k).filter((k) => !only || only.includes(joints[k]));

  if (!subset.length) return;

  setPhase('moving');

  const fitter = calibrator();

  try {
    const recording = await playBench(subset);

    if (!recording) return;

    setPhase('fitting');

    for (const [i, k] of subset.entries()) {
      const logs = benchLogs(recording, i);
      const calibration = await fitter.calibrate({ family: recording.family, logs });

      record(joints[k], { ...calibration, logId: keepBenchLogs(recording.family, logs) });
      forgetLag(joints[k]);
    }
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
