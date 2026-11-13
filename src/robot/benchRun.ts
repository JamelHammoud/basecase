import type { BenchRecording, BenchSample } from '../reality/benchLogs';
import { familyOfRobot } from '../reality/benchLogs';
import { BENCH_SECONDS, benchOffset } from '../reality/benchSequence';
import { radiansFromCounts, type RobotState, type RobotStatus } from './robotState';
import { robotSnapshot, sendRobotCommand, setBenchDriving, subscribeRobot } from './robotStore';

export const BENCH_INTENT_MS = 25;

export const canRunBench = (state: RobotState) =>
  state.link === 'connected' && state.mode === 'test' && state.status?.run === 'running';

const radians = (position: number | null | undefined) =>
  typeof position === 'number' ? radiansFromCounts(position) : null;

function measuredStarts(state: RobotState): number[] {
  return (state.spec?.ids ?? []).map((id) => radians(state.status?.joints.find((j) => j.id === id)?.position) ?? 0);
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

class BenchClock {
  private readonly startedAt = performance.now();
  private offset: number | null = null;

  elapsed() {
    return (performance.now() - this.startedAt) / 1000;
  }

  secondsOf(status: RobotStatus) {
    if (typeof status.at_us !== 'number') return this.elapsed();

    this.offset ??= this.elapsed() - status.at_us / 1e6;

    return status.at_us / 1e6 + this.offset;
  }
}

export function playBench(): Promise<BenchRecording | null> {
  const begun = robotSnapshot();

  if (!canRunBench(begun) || !begun.spec) return Promise.resolve(null);

  const { ids, family } = begun.spec;
  const starts = measuredStarts(begun);
  const samples: BenchSample[] = [];
  const clock = new BenchClock();
  const intent = (offset: number) => void sendRobotCommand({ cmd: 'intent', joints: starts.map((s) => s + offset) });
  let last = begun.status;

  return new Promise((resolve) => {
    let done = false;

    const finish = (finished: boolean) => {
      if (done) return;

      done = true;
      clearInterval(timer);
      unsubscribe();
      intent(0);
      setBenchDriving(false);

      resolve(finished ? { family: familyOfRobot(family), starts, samples } : null);
    };
    const tick = () => {
      const seconds = clock.elapsed();

      if (seconds >= BENCH_SECONDS) finish(true);
      else intent(benchOffset(seconds));
    };
    const onState = () => {
      const state = robotSnapshot();

      if (!canRunBench(state)) {
        finish(false);

        return;
      }

      if (!state.status || state.status === last) return;

      last = state.status;
      samples.push(sampleOf(state.status, ids, clock.secondsOf(state.status)));
    };

    setBenchDriving(true);

    const unsubscribe = subscribeRobot(onState);
    const timer = setInterval(tick, BENCH_INTENT_MS);
  });
}
