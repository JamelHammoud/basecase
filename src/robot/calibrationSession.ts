import { useSyncExternalStore } from 'react';
import { benchLogs } from '../reality/benchLogs';
import { keepBenchLogs } from '../reality/benchLogStore';
import { calibrator } from '../reality/calibrateClient';
import type { ServoCalibration } from '../reality/types';
import { canRunBench, playBench } from './benchRun';
import { robotSceneJoints, robotSnapshot } from './robotStore';

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

export const canCalibrate = () => phase === 'idle' && Boolean(robotSceneJoints()) && canRunBench(robotSnapshot());

export async function calibrateRobot(record: RecordCalibration): Promise<void> {
  const joints = robotSceneJoints();

  if (!joints || !canCalibrate()) return;

  setPhase('moving');

  const fitter = calibrator();

  try {
    const recording = await playBench();

    if (!recording) return;

    setPhase('fitting');

    for (const [k, jointId] of joints.entries()) {
      const logs = benchLogs(recording, k);
      const calibration = await fitter.calibrate({ family: recording.family, logs });

      record(jointId, { ...calibration, logId: keepBenchLogs(recording.family, logs) });
    }
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
