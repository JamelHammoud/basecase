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
import { robotSceneJoints, robotSnapshot } from './robotStore';
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
  recordMount: RecordMount;
  calibrations: Record<string, CalibrationHistory> | undefined;
  cameras?: FixedCamera[];
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

export const wantedMounts = (connected: readonly string[], calibrations: CalibrateRobotInput['calibrations']) =>
  connected.map((jointId) => activeMount(calibrations?.[jointId]) ?? DEFAULT_MOUNT);

interface CaptureInput {
  input: CalibrateRobotInput;
  connected: string[];
  moving: BenchJoint[];
  fitter: Calibrator;
}

const unmeasured = (mounts: readonly JointMount[], m: BenchJoint) => sameMount(mounts[m.index], DEFAULT_MOUNT);

const mountReason = (r: MountResult) => `${r.score.toFixed(3)} / ${r.runnerUp.toFixed(3)}`;

async function capturedFrames(searched: BenchJoint[], source: Parameters<typeof captureWiggle>[1]) {
  const frames: MountFrame[] = [];

  for (const { index } of searched) {
    const shots = await captureWiggle(index, source);

    if (!shots) return null;

    frames.push(...shots);
  }

  return frames;
}

async function findJointMounts({ input, connected, moving, fitter }: CaptureInput): Promise<boolean> {
  const wanted = wantedMounts(connected, input.calibrations);

  if (wanted.some((m, k) => !sameMount(m, connectionMounts()[k])) && !(await remount(wanted))) return false;

  const searched = moving.filter((m) => unmeasured(wanted, m));
  const { spec, emulated } = robotSnapshot();

  if (!searched.length || !emulated || !spec) return true;

  setPhase('capturing');

  const view = calibrationView(input.parts, input.cameras);
  const status = () => robotSnapshot().status;
  const source = emulatedCamera({ ...input, view, connected: { ids: spec.ids, joints: connected }, status });
  const frames = await capturedFrames(searched, source);

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

  return found.every((m, k) => sameMount(m, wanted[k])) || remount(found);
}

async function fitServos(input: CalibrateRobotInput, moving: BenchJoint[], fitter: Calibrator) {
  setPhase('moving');

  const recording = await playBench(moving.map((m) => m.index));

  if (!recording) return;

  setPhase('fitting');

  for (const [joint, { jointId, servo }] of moving.entries()) {
    const logs = benchLogs({ recording, joint, servo });
    const calibration = await fitter.calibrate({ servo, logs });

    input.record(jointId, { ...calibration, logId: keepBenchLogs(servo, logs) });
    forgetLag(jointId);
  }
}

export async function calibrateRobot(input: CalibrateRobotInput): Promise<void> {
  const connected = connectedFrom(input.joints);

  if (!connected || !canCalibrate(input.joints)) return;

  const moving = benchJoints(input, connected);

  if (!moving.length) return;

  setPhase('capturing');

  const fitter = calibrator();

  try {
    if (await findJointMounts({ input, connected, moving, fitter })) await fitServos(input, moving, fitter);
  } finally {
    fitter.dispose();
    setPhase('idle');
  }
}
