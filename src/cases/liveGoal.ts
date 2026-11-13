import { RECORD_HZ } from '../sim/recorder';
import { evaluateContract } from '../skills/contract';
import type { ProbeReader } from './probes';
import type { Contract } from './contract';

const DT = 1 / RECORD_HZ;
const MAX_SAMPLES = 600 * RECORD_HZ;

export interface LiveGoal {
  add: (time: number, poses: Float64Array) => void;
  failed: () => Promise<string[]>;
}

export function liveGoal(contract: Contract, reader: ProbeReader): LiveGoal {
  const signals: Record<string, number[]> = {};
  let start: number | null = null;
  let samples = 0;

  return {
    add(time, poses) {
      start ??= time;

      while (samples * DT <= time - start + 1e-9 && samples < MAX_SAMPLES) {
        reader.sample(poses, signals);
        samples++;
      }
    },
    async failed() {
      if (samples < 2) return [];

      const result = await evaluateContract(contract, { dt: DT, signals }).catch(() => null);

      return result?.failed ?? [];
    },
  };
}
