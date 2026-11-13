import { useSyncExternalStore } from 'react';
import { benchLogs } from '../reality/benchLogs';
import { keepBenchLogs } from '../reality/benchLogStore';
import { calibrator } from '../reality/calibrateClient';
import { benchServo } from '../reality/servoPart';
import type { ServoCalibration, ServoPart } from '../reality/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { canRunBench, playBench } from './benchRun';
import { servoFamily } from './robotState';
import { robotSceneJoints, robotSnapshot } from './robotStore';
import { forgetLag } from './robotTwin';
import { sceneRobotChoices } from './sceneRobot';

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
  const robot = sceneRobotChoices(sceneJoints);

  return connected && robot.ok && robot.choices.some((c) => sameIds(connected, c.joints)) ? connected : null;
}

export const canCalibrate = (sceneJoints: readonly RobotJoint[]) =>
  phase === 'idle' && Boolean(connectedFrom(sceneJoints)) && canRunBench(robotSnapshot());

export interface CalibrateRobotInput {
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  record: RecordCalibration;
  only?: readonly string[];
}

interface BenchJoint {
  index: number;
  jointId: string;
  servo: ServoPart;
}

function benchJoints({ joints: sceneJoints, parts, only }: CalibrateRobotInput, connected: string[]): BenchJoint[] {
  const bus = servoFamily(robotSnapshot().spec);

  if (!bus) return [];

  return connected.flatMap((jointId, index) => {
    const servo = benchServo({ joint: sceneJoints.find((j) => j.id === jointId), parts, bus });

    return servo && (!only || only.includes(jointId)) ? [{ index, jointId, servo }] : [];
  });
}

export async function calibrateRobot(input: CalibrateRobotInput): Promise<void> {
  const connected = connectedFrom(input.joints);

  if (!connected || !canCalibrate(input.joints)) return;

  const moving = benchJoints(input, connected);

  if (!moving.length) return;

  setPhase('moving');

  const fitter = calibrator();

  try {
    const recording = await playBench(moving.map((m) => m.index));

    if (!recording) return;

    setPhase('fitting');

    for (const [joint, { jointId, servo }] of moving.entries()) {
      const logs = benchLogs({ recording, joint, servo });
      const calibration = await fitter.calibrate({ servo, logs });

      input.record(jointId, { ...calibration, logId: keepBenchLogs(servo, logs) });
      forgetLag(jointId);
    }
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
