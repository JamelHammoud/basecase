import type { BenchRecording, BenchSample } from '../reality/benchLogs';
import { BENCH_SECONDS, benchOffset } from '../reality/benchSequence';
import { servoFamily, statusRadians, type RobotMount, type RobotState, type RobotStatus } from './robotState';
import { robotSnapshot, selectedUnit } from './robotStore';
import { executeBench } from './benchExecution';
import {
  claimTrajectory,
  trajectoryObservation,
  trajectoryReady,
  trajectoryTarget,
  trajectoryTelemetry,
  type BenchTrajectoryInput,
  type BenchTrajectoryOutcome,
} from './benchTrajectory';

export { BENCH_INTENT_MS } from './benchExecution';

export const canRunBench = (state: RobotState) =>
  state.link === 'connected' &&
  servoFamily(state.spec) !== null &&
  state.mode === 'test' &&
  state.status?.run === 'running' &&
  !state.status.fault_latched &&
  !state.status.sealed;

function measuredStarts(state: RobotState): number[] {
  return (state.spec?.ids ?? []).map((id) => statusRadians(state.status, state.calibration, id) ?? 0);
}

export interface BenchPlan {
  seconds: number;
  offset: (seconds: number) => number;
}

export const SERVO_BENCH: BenchPlan = { seconds: BENCH_SECONDS, offset: benchOffset };

export type HearStatus = (status: RobotStatus) => void;

export interface HeardStatus {
  status: RobotStatus;
  heardS: number;
}

interface SampleInput {
  status: RobotStatus;
  ids: number[];
  calibration: readonly RobotMount[];
  seconds: number;
}

function sampleOf({ status, ids, calibration, seconds }: SampleInput): BenchSample {
  return {
    seconds,
    joints: ids.map((id) => {
      const joint = status.joints.find((j) => j.id === id);

      return {
        positionRad: statusRadians(status, calibration, id),
        volts: joint?.volts ?? null,
        temperatureC: joint?.temp_c ?? null,
      };
    }),
  };
}

const daemonSeconds = (status: RobotStatus) => (typeof status.at_us === 'number' ? status.at_us / 1e6 : null);

const leadOf = ({ status, heardS }: HeardStatus) => heardS - (daemonSeconds(status) ?? Number.NEGATIVE_INFINITY);

const secondsOf = ({ status, heardS }: HeardStatus, lead: number) => {
  const at = daemonSeconds(status);

  return at === null ? heardS : at + lead;
};

const earliestLead = (heard: HeardStatus[]) => Math.min(...heard.map(leadOf));

export function benchSeconds(heard: HeardStatus[]): number[] {
  const lead = earliestLead(heard);

  return heard.map((h) => secondsOf(h, lead));
}

export function playBench(
  moving?: readonly number[],
  plan: BenchPlan = SERVO_BENCH,
  hear?: HearStatus,
  unit: string = selectedUnit(),
): Promise<BenchRecording | null> {
  const begun = robotSnapshot(unit);

  if (!canRunBench(begun) || !begun.spec) return Promise.resolve(null);

  const { ids: servos } = begun.spec;
  const subset = moving ?? servos.map((_, k) => k);
  const ids = subset.map((k) => servos[k]);
  const holds = measuredStarts(begun);
  const starts = subset.map((k) => holds[k]);
  const heard: HeardStatus[] = [];
  const recording = (): BenchRecording => {
    const seconds = benchSeconds(heard);

    return {
      starts,
      samples: heard.map((h, i) =>
        sampleOf({ status: h.status, ids, calibration: begun.calibration, seconds: seconds[i] }),
      ),
    };
  };
  let lead = Number.POSITIVE_INFINITY;
  const execution = executeBench({
    unit,
    begun,
    seconds: plan.seconds,
    target: (seconds) => holds.map((start, index) => start + (subset.includes(index) ? plan.offset(seconds) : 0)),
    running: canRunBench,
    returnToStart: holds,
    hear: (status, heardS) => {
      const next = { status, heardS };

      heard.push(next);
      lead = Math.min(lead, leadOf(next));
      hear?.(status);

      return secondsOf(next, lead) >= plan.seconds;
    },
  });

  return execution?.then((kind) => (kind === 'completed' ? recording() : null)) ?? Promise.resolve(null);
}

export async function playBenchTrajectory(input: BenchTrajectoryInput): Promise<BenchTrajectoryOutcome> {
  const begun = robotSnapshot(input.unit);
  const run = {
    joints: [...input.joints],
    statuses: [] as BenchTrajectoryOutcome['run']['statuses'],
    intents: [] as BenchTrajectoryOutcome['run']['intents'],
    faultJoint: null,
    faultAt: 0,
    message: '',
  };

  if (input.unit !== selectedUnit() || !trajectoryReady(input, begun) || !canRunBench(begun))
    return { kind: 'refused', run };

  const points = input.points.map((point) => ({ at: point.at, joints: [...point.joints] }));
  const seconds = points.at(-1)!.at / 1000;
  const control = input.recording
    ? await claimTrajectory({ ...input, joints: [...input.joints], points }, begun, seconds)
    : undefined;

  if (control === null) return { kind: 'refused', run };

  run.statuses.push(trajectoryObservation(begun, 0));

  const execution = executeBench({
    ...input,
    current: () => input.unit === selectedUnit() && (input.current?.() ?? true),
    begun,
    seconds,
    strict: true,
    control,
    target: (at) => trajectoryTarget(points, at),
    running: canRunBench,
    accepted: (intent) => run.intents.push(intent),
    validStatus: (status) => trajectoryTelemetry({ ...begun, status }) && run.statuses.length < 4096,
    hear: (status, heardS) => {
      const sample = trajectoryObservation({ ...begun, status }, heardS * 1000);

      if (sample.at > run.statuses.at(-1)!.at) run.statuses.push(sample);

      return heardS >= seconds;
    },
  });

  return { kind: (await execution) ?? 'refused', run };
}
