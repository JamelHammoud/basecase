import { useSyncExternalStore } from 'react';
import { activeMount, type CalibrationHistory, type FoundMount } from '../reality/history';
import { sameMount } from '../reality/mountSearch';
import { benchServo } from '../reality/servoPart';
import type { JointMount } from '../reality/types';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { canRunBench, playBench } from './benchRun';
import { connectedFrom, holdCalibration } from './calibrationSession';
import { connectionMounts, jointMount, remount } from './mountCapture';
import {
  analyseMotor,
  isFixable,
  probeOf,
  REFERENCE_PLAN,
  REPLAY_TOLERANCE_RAD,
  replayGaps,
  WIGGLE_PLAN,
  widest,
  withinTestCaps,
  type PowerOnFinding,
  type Probe,
} from './powerOnCheck';
import { mountOf, servoFamily, statusRadians, type JointStatus, type RobotEvent, type RobotStatus } from './robotState';
import { remapConnectedJoints, robotHomeJoints, robotSnapshot, selectedUnit } from './robotStore';
import { noteSimAngles, showReferenceMotion } from './robotTwin';
import { subscribeUnitRobot } from './unitSubscription';

export type PowerOnOutcome = 'confirmed' | 'refused' | 'paused';

export interface PowerOnStep {
  jointId: string;
  name: string;
  id: number;
}

export interface PowerOnState {
  unit: string | null;
  running: boolean;
  step: PowerOnStep | null;
  replaying: boolean;
  findings: PowerOnFinding[];
  skipped: string[];
  outcome: PowerOnOutcome | null;
  refusal: { jointId: string; message: string } | null;
}

export const IDLE_POWER_ON: PowerOnState = {
  unit: null,
  running: false,
  step: null,
  replaying: false,
  findings: [],
  skipped: [],
  outcome: null,
  refusal: null,
};

export type RecordPowerOn = (jointId: string, found: FoundMount) => void;

export interface PowerOnInput {
  unit?: string;
  joints: readonly RobotJoint[];
  parts: readonly ScenePart[];
  calibrations: Record<string, CalibrationHistory> | undefined;
  record: RecordPowerOn;
}

let snapshot: PowerOnState = IDLE_POWER_ON;
let session: { unit: string; passed: Set<string>; unverified: Set<string> } | null = null;
let skipping = false;
const listeners = new Set<() => void>();

function publish(next: Partial<PowerOnState>) {
  snapshot = { ...snapshot, ...next };

  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const powerOnState = () => snapshot;

export const usePowerOn = () => useSyncExternalStore(subscribe, powerOnState);

export function resetPowerOn() {
  session = null;
  skipping = false;
  snapshot = IDLE_POWER_ON;

  for (const listener of listeners) listener();
}

export const skipPowerOnStep = () => {
  if (snapshot.running && snapshot.step) skipping = true;
};

const nameOf = (joints: readonly RobotJoint[], jointId: string) =>
  joints.find((j) => j.id === jointId)?.name ?? jointId;

const DEGREES = 180 / Math.PI;

export function describeFinding(finding: PowerOnFinding, joints: readonly RobotJoint[]): string {
  const name = nameOf(joints, finding.jointId);

  switch (finding.kind) {
    case 'swapped':
      return `Motor ${finding.id} moves ${nameOf(joints, finding.movedJointId)}, not ${name}.`;
    case 'reversed':
      return `${name} turns the wrong way.`;
    case 'offset':
      return `${name} starts ${Math.round(finding.gapRad * DEGREES)}° off zero.`;
    case 'missing':
    case 'stuck':
      return `${name} doesn’t answer.`;
    case 'duplicate':
      return `${name} shares its ID.`;
  }
}

export const unconfirmedJoints = (
  connected: readonly string[],
  calibrations: Record<string, CalibrationHistory> | undefined,
  unit: string = selectedUnit(),
) =>
  connected.filter(
    (jointId) => !activeMount(calibrations?.[jointId]) || (session?.unverified.has(jointId) && session.unit === unit),
  );

export function canCheckPower(
  joints: readonly RobotJoint[],
  calibrations: Record<string, CalibrationHistory> | undefined,
  unit: string = selectedUnit(),
): boolean {
  const state = robotSnapshot(unit);
  const connected = connectedFrom(joints, unit);

  return (
    Boolean(connected) &&
    state.emulated &&
    canRunBench(state) &&
    unconfirmedJoints(connected ?? [], calibrations, unit).length > 0
  );
}

const refuse = (jointId: string, message: string, extra: Partial<PowerOnState> = {}) =>
  publish({
    running: false,
    step: null,
    replaying: false,
    outcome: 'refused',
    refusal: { jointId, message },
    ...extra,
  });

interface Run {
  unit: string;
  input: PowerOnInput;
  connected: string[];
  ids: number[];
  faults: Array<{ id: number; code: string }>;
}

function peakOf(statuses: readonly RobotStatus[], id: number, rest: Probe): Probe | null {
  let peak: Probe | null = null;

  for (const status of statuses) {
    const probe = probeOf(status.joints.find((j) => j.id === id));

    if (probe && Math.abs(probe.counts - rest.counts) >= Math.abs((peak?.counts ?? rest.counts) - rest.counts))
      peak = probe;
  }

  return peak;
}

function homeJointOf(run: Run, drives: number): string | null {
  const home = robotHomeJoints(run.unit);

  return home?.[run.ids.indexOf(drives)] ?? null;
}

function findMotor(run: Run, k: number, statuses: readonly RobotStatus[]): PowerOnFinding | null {
  const id = run.ids[k];
  const jointId = run.connected[k];
  const rest = probeOf(statuses[0]?.joints.find((j) => j.id === id));
  const peak = rest && peakOf(statuses, id, rest);

  if (!rest || !peak) return { kind: 'stuck', id, jointId };

  const movedJointId = homeJointOf(run, peak.drives) ?? jointId;
  const belief = mountOf(robotSnapshot(run.unit).calibration, id) ?? { zero_counts: 2048, direction: 1 as const };

  return analyseMotor({ id, jointId, movedJointId, belief, rest, peak });
}

const SHARED_ID_FAULTS = new Set(['duplicate_id', 'garbled', 'wrong_id']);

function faultAnswer(run: Run, k: number): PowerOnFinding | null {
  const id = run.ids[k];
  const fault = run.faults.find((f) => SHARED_ID_FAULTS.has(f.code) && f.id === id);

  return fault ? { kind: 'duplicate', id, jointId: run.connected[k] } : null;
}

const answers = (joints: readonly JointStatus[] | undefined, id: number) =>
  joints?.some((j) => j.id === id && j.reply === 'ok') ?? false;

function liveRun(run: Run) {
  const state = robotSnapshot(run.unit);

  return state.link === 'connected' && canRunBench(state);
}

async function wiggle(run: Run, k: number): Promise<PowerOnFinding | 'skipped' | 'ended' | null> {
  const statuses: RobotStatus[] = [];
  const recording = await playBench([k], WIGGLE_PLAN, (status) => statuses.push(status), run.unit);

  if (skipping) return 'skipped';

  if (!liveRun(run) && !run.faults.length) return 'ended';

  return (
    faultAnswer(run, k) ??
    (recording ? findMotor(run, k, statuses) : { kind: 'stuck', id: run.ids[k], jointId: run.connected[k] })
  );
}

async function stepThrough(run: Run): Promise<void> {
  const found: PowerOnFinding[] = [];
  const skipped: string[] = [];

  for (const [k, jointId] of run.connected.entries()) {
    if (session?.passed.has(jointId)) continue;

    const id = run.ids[k];

    skipping = false;
    publish({ step: { jointId, id, name: nameOf(run.input.joints, jointId) } });

    if (!answers(robotSnapshot(run.unit).status?.joints, id)) {
      found.push({ kind: 'missing', id, jointId });

      break;
    }

    const result = await wiggle(run, k);

    if (result === 'ended') return resetPowerOn();

    if (result === 'skipped') skipped.push(jointId);
    else if (result) found.push(result);
    else session?.passed.add(jointId);

    if (found.some((f) => !isFixable(f))) break;
  }

  await conclude(run, found, skipped);
}

function recordConfirmed(run: Run) {
  const bus = servoFamily(robotSnapshot(run.unit).spec);

  if (!bus) return;

  const mounts = connectionMounts(run.unit);

  for (const [k, jointId] of run.connected.entries()) {
    const servo = benchServo({ joint: run.input.joints.find((j) => j.id === jointId), parts: run.input.parts, bus });

    if (servo && !activeMount(run.input.calibrations?.[jointId]))
      run.input.record(jointId, { servo, verdict: 'measured', mount: mounts[k], reason: 'Matches the simulation.' });
  }
}

function hearReference(run: Run, statuses: RobotStatus[]) {
  const begun = robotSnapshot(run.unit);
  const starts = run.ids.map((id) => statusRadians(begun.status, begun.calibration, id) ?? 0);
  const t0 = performance.now();
  const shown = run.unit === selectedUnit();

  showReferenceMotion(shown);

  return (status: RobotStatus) => {
    statuses.push(status);

    if (shown)
      noteSimAngles(
        run.connected,
        starts.map((start) => start + REFERENCE_PLAN.offset((performance.now() - t0) / 1000)),
      );
  };
}

async function replay(run: Run) {
  publish({ step: null, replaying: true });

  const statuses: RobotStatus[] = [];
  const recording = await playBench(undefined, REFERENCE_PLAN, hearReference(run, statuses), run.unit);

  showReferenceMotion(false);

  if (!liveRun(run) && !run.faults.length) return resetPowerOn();

  const gap = recording
    ? widest(
        replayGaps(
          recording.samples.map((sample, i) => ({
            seconds: sample.seconds,
            link: run.ids.map((id) => statuses[i]?.joints.find((j) => j.id === id)?.link_rad ?? null),
          })),
          REFERENCE_PLAN,
          run.ids.length,
        ),
      )
    : { index: 0, gapRad: Number.POSITIVE_INFINITY };
  const worst = gap ?? { index: 0, gapRad: Number.POSITIVE_INFINITY };
  const jointId = run.connected[worst.index];
  const name = nameOf(run.input.joints, jointId);

  if (worst.gapRad <= REPLAY_TOLERANCE_RAD) {
    recordConfirmed(run);
    session?.unverified.clear();
    publish({ running: false, replaying: false, outcome: 'confirmed', refusal: null });

    return;
  }

  const degrees = Number.isFinite(worst.gapRad) ? `${Math.round(worst.gapRad * DEGREES)}°` : 'far';

  refuse(jointId, `${name} strays ${degrees} from the simulation.`);
}

async function conclude(run: Run, findings: PowerOnFinding[], skipped: string[]) {
  const first = findings[0];

  if (first) {
    refuse(first.jointId, describeFinding(first, run.input.joints), { findings, skipped });

    return;
  }

  if (skipped.length) {
    publish({ running: false, step: null, outcome: 'paused', skipped, findings: [] });

    return;
  }

  await replay(run);
}

function runOf(input: PowerOnInput): Run | null {
  const unit = input.unit ?? selectedUnit();
  const connected = connectedFrom(input.joints, unit);
  const ids = robotSnapshot(unit).spec?.ids;

  return connected && ids && canCheckPower(input.joints, input.calibrations, unit)
    ? { unit, input, connected, ids, faults: [] }
    : null;
}

const faultMotor = (event: RobotEvent): number => {
  if (typeof event.id === 'number') return event.id;

  return Number(/\b(\d+)\b/.exec(String(event.message ?? ''))?.[1] ?? Number.NaN);
};

export async function checkPowerOn(input: PowerOnInput): Promise<void> {
  const run = runOf(input);

  if (snapshot.running || !run) return;

  if (session?.unit !== run.unit) session = { unit: run.unit, passed: new Set(), unverified: new Set() };

  publish({ ...IDLE_POWER_ON, unit: run.unit, running: true });

  const stop = subscribeUnitRobot(run.unit, (event: RobotEvent) => {
    if (event.event === 'fault') run.faults.push({ id: faultMotor(event), code: String(event.code ?? '') });
  });

  try {
    if (!withinTestCaps(WIGGLE_PLAN) || !withinTestCaps(REFERENCE_PLAN))
      refuse(run.connected[0], `${nameOf(input.joints, run.connected[0])} is over the Test caps.`);
    else await stepThrough(run);
  } finally {
    stop();
    skipping = false;
  }
}

const mountFor = (finding: Extract<PowerOnFinding, { mount: JointMount }>) => finding.mount;

export async function fixPowerOn(input: PowerOnInput): Promise<boolean> {
  const run = runOf(input);
  const faults = snapshot.findings.filter(isFixable);

  if (snapshot.running || snapshot.unit !== run?.unit || !run || !faults.length) return false;

  const bus = servoFamily(robotSnapshot(run.unit).spec);
  const order = [...run.connected];
  const mounts = connectionMounts(run.unit);

  for (const fault of faults) {
    const k = run.ids.indexOf(fault.id);

    order[k] = fault.movedJointId;
    mounts[k] = jointMount({
      id: fault.id,
      zero_counts: mountFor(fault).zeroCounts,
      direction: mountFor(fault).direction,
    });
  }

  const clash = order.find((jointId, k) => order.indexOf(jointId) !== k);

  if (!bus || clash) {
    refuse(clash ?? run.connected[0], `${nameOf(input.joints, clash ?? run.connected[0])} shares its ID.`);

    return false;
  }

  const changed = mounts.some((m, k) => !sameMount(m, connectionMounts(run.unit)[k]));
  const applied = await holdCalibration(async () => {
    publish({ running: true });

    const remounted = !changed || (await remount(mounts, run.unit));

    publish({ running: false });

    if (!remounted) return false;

    remapConnectedJoints(run.unit, order);

    for (const fault of faults) {
      const servo = benchServo({
        joint: input.joints.find((j) => j.id === fault.movedJointId),
        parts: input.parts,
        bus,
      });

      if (servo)
        input.record(fault.movedJointId, {
          servo,
          verdict: 'measured',
          mount: fault.mount,
          reason: describeFinding(fault, input.joints),
        });
    }

    return true;
  });

  if (!applied) return false;

  session?.passed.clear();

  for (const fault of faults) session?.unverified.add(fault.movedJointId);

  publish({ findings: [], outcome: null, refusal: null, skipped: [] });

  return true;
}
