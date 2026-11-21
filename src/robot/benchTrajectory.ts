import type { RunIntent, RobotRun } from './runBuffer';
import type { RobotControl, RobotScene, RobotState } from './robotState';
import { statusRadians } from './robotState';
import { robotLinkState, robotSceneJoints, robotSnapshot, sendUnitCommand } from './robotStore';
import type { BenchEnd } from './benchExecution';

export const BENCH_START_TOLERANCE_RAD = (4 * Math.PI) / 4096;

export interface BenchTrajectoryInput {
  unit: string;
  joints: string[];
  points: RunIntent[];
  signal?: AbortSignal;
  current?: () => boolean;
  recording?: { recommendation: string; sourceKey: string };
  context?: RobotScene;
}

export interface BenchTrajectoryOutcome {
  kind: BenchEnd | 'refused';
  run: RobotRun;
}

export async function claimTrajectory(
  input: BenchTrajectoryInput,
  begun: RobotState,
  seconds: number,
): Promise<RobotControl | null | undefined> {
  if (!input.recording) return undefined;

  const connection = await robotLinkState(input.unit);

  if (connection?.endpoint) throw new Error('This unit can’t run the saved motion.');

  if (!connection?.control || !trajectoryReady(input, robotSnapshot(input.unit))) return null;

  const claimed = await sendUnitCommand(input.unit, {
    cmd: 'claim_control',
    control: connection.control,
    seconds,
    recording: input.recording,
    binding: {
      spec: connection.spec,
      calibration: connection.calibration,
      scene: input.context,
      start: input.points[0].joints,
    },
  });

  if (!claimed.ok) throw new Error(claimed.message);

  if (!claimed.control) return null;

  if (robotSnapshot(input.unit).spec === begun.spec && !input.signal?.aborted && (input.current?.() ?? true))
    return claimed.control;

  await sendUnitCommand(input.unit, { cmd: 'stop', control: claimed.control });

  return null;
}

function validPoints(points: RunIntent[], joints: number, speed: number): boolean {
  return (
    points.length >= 2 &&
    points.length <= 65 &&
    points[0].at === 0 &&
    points.at(-1)!.at > 0 &&
    points.at(-1)!.at <= 2000 &&
    points.every(
      (point, index) =>
        Number.isFinite(point.at) &&
        point.joints.length === joints &&
        point.joints.every(Number.isFinite) &&
        (index === 0 ||
          (point.at > points[index - 1].at &&
            point.joints.every(
              (value, joint) =>
                Math.abs(value - points[index - 1].joints[joint]) / ((point.at - points[index - 1].at) / 1000) <=
                speed + 1e-10,
            ))),
    )
  );
}

export function trajectoryLimits(input: BenchTrajectoryInput): boolean {
  return (
    validPoints(input.points, input.joints.length, input.recording ? 0.5 : 0.6) &&
    (!input.recording || input.points.every((point) => point.joints.every((value) => Math.abs(value) <= 2.8)))
  );
}

export function trajectoryReady(input: BenchTrajectoryInput, state: RobotState): boolean {
  const { points, joints, unit } = input;
  const measured = state.spec?.ids.map((id) => statusRadians(state.status, state.calibration, id));

  return (
    compatibleState(state) &&
    joints.length > 0 &&
    joints.length <= 16 &&
    new Set(joints).size === joints.length &&
    robotSceneJoints(unit)?.join('\0') === joints.join('\0') &&
    !!measured &&
    measured.length === joints.length &&
    trajectoryLimits(input) &&
    measured.every(
      (value, index) =>
        value !== null &&
        Number.isFinite(value) &&
        Math.abs(value - points[0].joints[index]) <= BENCH_START_TOLERANCE_RAD,
    ) &&
    (input.current?.() ?? true)
  );
}

function compatibleState(state: RobotState): boolean {
  return state.emulated && state.spec?.emulated === true && trajectoryTelemetry(state);
}

export function trajectoryTelemetry(state: RobotState): boolean {
  return (
    !!state.spec &&
    !!state.status &&
    state.spec.ids.every((id) => {
      const joint = state.status!.joints.find((entry) => entry.id === id);

      return Number.isFinite(joint?.position) && joint?.torque_on === true;
    })
  );
}

export function trajectoryTarget(points: RunIntent[], seconds: number): number[] {
  const at = seconds * 1000;
  const index = points.findIndex((point) => point.at >= at);

  if (index <= 0) return [...(index === 0 ? points[0] : points.at(-1)!).joints];

  const from = points[index - 1];
  const to = points[index];
  const phase = (at - from.at) / (to.at - from.at);

  return from.joints.map((value, joint) => value + phase * (to.joints[joint] - value));
}

export function trajectoryObservation(state: RobotState, at: number) {
  return {
    at,
    positions: (state.spec?.ids ?? []).map((id) => statusRadians(state.status, state.calibration, id)),
  };
}
