import type { BenchRecording, BenchSample } from '../reality/benchLogs';
import { BENCH_SECONDS, benchOffset } from '../reality/benchSequence';
import { radiansFromCounts, servoFamily, type RobotState, type RobotStatus } from './robotState';
import { robotSnapshot, sendRobotCommand, setBenchDriving, subscribeRobot } from './robotStore';

export const BENCH_INTENT_MS = 25;

const BENCH_END_GRACE_S = 1;

export const canRunBench = (state: RobotState) =>
  state.link === 'connected' &&
  servoFamily(state.spec) !== null &&
  state.mode === 'test' &&
  state.status?.run === 'running';

const radians = (position: number | null | undefined) =>
  typeof position === 'number' ? radiansFromCounts(position) : null;

function measuredStarts(state: RobotState): number[] {
  return (state.spec?.ids ?? []).map((id) => radians(state.status?.joints.find((j) => j.id === id)?.position) ?? 0);
}

export interface HeardStatus {
  status: RobotStatus;
  heardS: number;
}

function sampleOf(status: RobotStatus, ids: number[], seconds: number): BenchSample {
  return {
    seconds,
    joints: ids.map((id) => {
      const joint = status.joints.find((j) => j.id === id);

      return {
        positionRad: radians(joint?.position),
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

export function playBench(moving?: readonly number[]): Promise<BenchRecording | null> {
  const begun = robotSnapshot();

  if (!canRunBench(begun) || !begun.spec) return Promise.resolve(null);

  const { ids: servos } = begun.spec;
  const subset = moving ?? servos.map((_, k) => k);
  const ids = subset.map((k) => servos[k]);
  const holds = measuredStarts(begun);
  const starts = subset.map((k) => holds[k]);
  const heard: HeardStatus[] = [];
  const startedAt = performance.now();
  const elapsed = () => (performance.now() - startedAt) / 1000;
  const intent = (offset: number) =>
    void sendRobotCommand({ cmd: 'intent', joints: holds.map((s, k) => (subset.includes(k) ? s + offset : s)) });
  const recording = (): BenchRecording => {
    const seconds = benchSeconds(heard);

    return { starts, samples: heard.map((h, i) => sampleOf(h.status, ids, seconds[i])) };
  };
  let last = begun.status;
  let lead = Number.POSITIVE_INFINITY;

  return new Promise((resolve) => {
    let done = false;

    const finish = (finished: boolean) => {
      if (done) return;

      done = true;
      clearInterval(timer);
      unsubscribe();
      intent(0);
      setBenchDriving(false);

      resolve(finished ? recording() : null);
    };
    const tick = () => {
      const seconds = elapsed();

      if (seconds >= BENCH_SECONDS + BENCH_END_GRACE_S) finish(true);
      else intent(benchOffset(seconds));
    };
    const onState = () => {
      const state = robotSnapshot();

      if (!canRunBench(state)) {
        finish(false);

        return;
      }

      if (!state.status || state.status === last) return;

      const status: HeardStatus = { status: state.status, heardS: elapsed() };

      last = state.status;
      heard.push(status);
      lead = Math.min(lead, leadOf(status));

      if (secondsOf(status, lead) >= BENCH_SECONDS) finish(true);
    };

    setBenchDriving(true);

    const unsubscribe = subscribeRobot(onState);
    const timer = setInterval(tick, BENCH_INTENT_MS);
  });
}
