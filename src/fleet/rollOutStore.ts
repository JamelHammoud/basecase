import { useSyncExternalStore } from 'react';
import { pinUnitPolicy } from '../robot/robotStore';
import { climbUnit } from './climbUnit';
import { rollOut, ROLL_OUT_RUNG, type RollOutPorts, type RollOutSkill, type RollOutState } from './rollOut';
import type { TwinVerdict } from './twinArena';

let latest: RollOutState | null = null;
let running = false;
let stubbedTwins: Record<string, TwinVerdict> | null = null;
const listeners = new Set<() => void>();

function set(next: RollOutState | null) {
  latest = next;

  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export const rollOutSnapshot = () => latest;

export const useRollOut = () => useSyncExternalStore(subscribe, rollOutSnapshot, rollOutSnapshot);

export const rollingOut = () => running;

export function stubTwins(verdicts: Record<string, TwinVerdict> | null) {
  stubbedTwins = verdicts;
}

function stubbedProof(unit: string): TwinVerdict | null {
  return stubbedTwins ? (stubbedTwins[unit] ?? { unit, passes: 0, trials: 0, passed: false, line: '' }) : null;
}

export function unitPorts(prove: (unit: string) => Promise<TwinVerdict>): RollOutPorts {
  return {
    prove: async (unit) => stubbedProof(unit) ?? prove(unit),
    pin: async (unit, ref) => {
      const reply = await pinUnitPolicy(unit, ref);

      return reply.ok ? null : reply.message;
    },
    climb: (unit) => climbUnit(unit, ROLL_OUT_RUNG),
  };
}

export async function startRollOut(input: {
  skill: RollOutSkill;
  units: readonly string[];
  canaries?: readonly string[];
  ports: RollOutPorts;
}): Promise<RollOutState | null> {
  if (running) return null;

  running = true;

  try {
    return await rollOut({ ...input, onUpdate: set });
  } finally {
    running = false;
  }
}
