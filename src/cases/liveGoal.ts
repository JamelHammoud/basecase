import { RECORD_HZ } from '../sim/recorder';
import type { ContractResult } from '../skills/contract';
import type { GoalJudge, TraceDelta } from './goalJudge';
import type { ProbeReader } from './probes';

const DT = 1 / RECORD_HZ;
const MAX_SAMPLES = 600 * RECORD_HZ;

export interface LiveGoal {
  add: (time: number, poses: Float64Array) => void;
  probes: () => Record<string, number>;
  judge: () => Promise<ContractResult | null>;
}

export function liveGoal(reader: ProbeReader, judge: GoalJudge): LiveGoal {
  const signals: Record<string, number[]> = {};
  const sent: Record<string, number> = {};
  let start: number | null = null;
  let samples = 0;

  const unsent = (): TraceDelta =>
    Object.fromEntries(
      Object.entries(signals).map(([name, trace]) => {
        const from = sent[name] ?? 0;

        sent[name] = trace.length;

        return [name, trace.slice(from)];
      }),
    );

  return {
    add(time, poses) {
      start ??= time;

      while (samples * DT <= time - start + 1e-9 && samples < MAX_SAMPLES) {
        reader.sample(poses, signals);
        samples++;
      }
    },
    probes: () => Object.fromEntries(Object.entries(signals).map(([name, trace]) => [name, trace.at(-1) ?? 0])),
    async judge() {
      if (samples < 2) return null;

      return judge.judge(DT, unsent());
    },
  };
}
