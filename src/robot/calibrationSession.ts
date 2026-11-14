import { useSyncExternalStore } from 'react';
import type { FixedCamera } from '../cameras/fixed';
import { calibrationView, emulatedCamera } from '../cameras/silhouetteSource';
import { benchLogs } from '../reality/benchLogs';
import { keepBenchLogs } from '../reality/benchLogStore';
import { calibrator, type Calibrator } from '../reality/calibrateClient';
import { activeMount, type CalibrationHistory, type FoundMount } from '../reality/history';
import { DEFAULT_MOUNT, sameMount, type MountFrame, type MountResult } from '../reality/mountSearch';
import { benchServo } from '../reality/servoPart';
import type { JointMount, ServoCalibration, ServoPart } from '../reality/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { canRunBench, playBench } from './benchRun';
import { captureWiggle, connectionMounts, remount } from './mountCapture';
import { servoFamily } from './robotState';
import { robotSceneJoints, robotSnapshot, selectedUnit } from './robotStore';
import { forgetLag } from './robotTwin';
import { sceneRobotChoices } from './sceneRobot';

export type CalibrationPhase = 'idle' | 'capturing' | 'moving' | 'fitting';

export type RecordCalibration = (jointId: string, calibration: ServoCalibration) => void;

export type RecordMount = (jointId: string, found: FoundMount) => void;

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

export function connectedFrom(sceneJoints: readonly RobotJoint[], unit: string = selectedUnit()): string[] | null {
  const connected = robotSceneJoints(unit);
  const robot = sceneRobotChoices(sceneJoints);

  return connected && robot.ok && robot.choices.some((c) => sameIds(connected, c.joints)) ? connected : null;
}

export const canCalibrate = (sceneJoints: readonly RobotJoint[], unit: string = selectedUnit()) =>
  phase === 'idle' && Boolean(connectedFrom(sceneJoints, unit)) && canRunBench(robotSnapshot(unit));

export interface CalibrateRobotInput {
  unit?: string;
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  record: RecordCalibration;
  recordMount: RecordMount;
  calibrations: Record<string, CalibrationHistory> | undefined;
  cameras?: FixedCamera[];
  only?: readonly string[];
}

type CapturedCalibrationInput = CalibrateRobotInput & { unit: string };

interface BenchJoint {
  index: number;
  jointId: string;
  servo: ServoPart;
}

function benchJoints(
  { joints: sceneJoints, parts, only, unit }: CapturedCalibrationInput,
  connected: string[],
): BenchJoint[] {
  const bus = servoFamily(robotSnapshot(unit).spec);

  if (!bus) return [];

  return connected.flatMap((jointId, index) => {
    const servo = benchServo({ joint: sceneJoints.find((j) => j.id === jointId), parts, bus });

    return servo && (!only || only.includes(jointId)) ? [{ index, jointId, servo }] : [];
  });
}

export const wantedMounts = (connected: readonly string[], calibrations: CalibrateRobotInput['calibrations']) =>
  connected.map((jointId) => activeMount(calibrations?.[jointId]) ?? DEFAULT_MOUNT);

interface CaptureInput {
  input: CapturedCalibrationInput;
  connected: string[];
  moving: BenchJoint[];
  fitter: Calibrator;
}

const unmeasured = (mounts: readonly JointMount[], m: BenchJoint) => sameMount(mounts[m.index], DEFAULT_MOUNT);

const mountReason = (r: MountResult) => `${r.score.toFixed(3)} / ${r.runnerUp.toFixed(3)}`;

async function capturedFrames(searched: BenchJoint[], source: Parameters<typeof captureWiggle>[1], unit: string) {
  const frames: MountFrame[] = [];

  for (const { index } of searched) {
    const shots = await captureWiggle(index, source, unit);

    if (!shots) return null;

    frames.push(...shots);
  }

  return frames;
}

async function findJointMounts({ input, connected, moving, fitter }: CaptureInput): Promise<boolean> {
  const { unit } = input;
  const wanted = wantedMounts(connected, input.calibrations);

  if (wanted.some((m, k) => !sameMount(m, connectionMounts(unit)[k])) && !(await remount(wanted, unit))) return false;

  const searched = moving.filter((m) => unmeasured(wanted, m));
  const { spec, emulated } = robotSnapshot(unit);

  if (!searched.length || !emulated || !spec) return true;

  setPhase('capturing');

  const view = calibrationView(input.parts, input.cameras);
  const status = () => robotSnapshot(unit).status;
  const source = emulatedCamera({ ...input, view, connected: { ids: spec.ids, joints: connected }, status });
  const frames = await capturedFrames(searched, source, unit);

  if (!frames) return false;

  const search = searched.map((m) => m.jointId);
  const request = { parts: [...input.parts], joints: [...input.joints], view, order: connected, frames, search };
  const results = await fitter.mounts({ ...request, mounts: wanted });

  for (const r of results.filter((x) => x.verdict !== 'consistent')) {
    const servo = searched.find((m) => m.jointId === r.jointId)!.servo;

    input.recordMount(r.jointId, { servo, verdict: r.verdict, mount: r.mount, reason: mountReason(r) });
  }

  const found = wanted.map(
    (m, k) => results.find((r) => r.jointId === connected[k] && r.verdict === 'measured')?.mount ?? m,
  );

  return found.every((m, k) => sameMount(m, wanted[k])) || remount(found, unit);
}

async function fitServos(input: CapturedCalibrationInput, moving: BenchJoint[], fitter: Calibrator) {
  setPhase('moving');

  const recording = await playBench(
    moving.map((m) => m.index),
    undefined,
    undefined,
    input.unit,
  );

  if (!recording) return;

  setPhase('fitting');

  for (const [joint, { jointId, servo }] of moving.entries()) {
    const logs = benchLogs({ recording, joint, servo });
    const calibration = await fitter.calibrate({ servo, logs });

    input.record(jointId, { ...calibration, logId: keepBenchLogs(servo, logs) });

    if (selectedUnit() === input.unit) forgetLag(jointId);
  }
}

export async function calibrateRobot(input: CalibrateRobotInput): Promise<void> {
  const unit = input.unit ?? selectedUnit();
  const captured = { ...input, unit };
  const connected = connectedFrom(input.joints, unit);

  if (!connected || !canCalibrate(input.joints, unit)) return;

  const moving = benchJoints(captured, connected);

  if (!moving.length) return;

  setPhase('capturing');

  const fitter = calibrator();

  try {
    if (await findJointMounts({ input: captured, connected, moving, fitter }))
      await fitServos(captured, moving, fitter);
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
