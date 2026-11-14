import type { RobotPolicyRef } from '../robot/robotPolicy';
import { errorMessage } from '../utils/errorMessage';
import type { TwinVerdict } from './twinArena';

export const ROLL_OUT_RUNG = 'rehearse';

export interface RollOutSkill {
  hash: string;
  label: string;
}

export interface RollOutPorts {
  prove: (unit: string) => Promise<TwinVerdict>;
  pin: (unit: string, ref: RobotPolicyRef) => Promise<string | null>;
  climb: (unit: string) => Promise<string | null>;
}

export interface RollOutPlan {
  canaries: string[];
  rest: string[];
  held: Record<string, string>;
}

export type RollOutStage = 'proving' | 'canaries' | 'rest' | 'done' | 'stopped';

export interface RollOutState {
  skill: RollOutSkill;
  stage: RollOutStage;
  verdicts: Record<string, TwinVerdict>;
  held: Record<string, string>;
  failures: Record<string, string>;
  reached: string[];
  stopped: { unit: string; message: string } | null;
}

const byName = (units: readonly string[]) => [...new Set(units)].sort((a, b) => a.localeCompare(b));

export const defaultCanaries = (units: readonly string[]) => {
  const names = byName(units);

  return names.slice(0, names.length > 3 ? 2 : 1);
};

export function planRollOut(input: {
  units: readonly string[];
  canaries: readonly string[];
  verdicts: Record<string, TwinVerdict>;
}): RollOutPlan {
  const units = byName(input.units);
  const chosen = new Set(input.canaries.filter((u) => units.includes(u)));
  const passes = (unit: string) => input.verdicts[unit]?.passed === true;
  const held = Object.fromEntries(units.filter((u) => !passes(u)).map((u) => [u, input.verdicts[u]?.line ?? '']));

  return {
    canaries: units.filter((u) => chosen.has(u) && passes(u)),
    rest: units.filter((u) => !chosen.has(u) && passes(u)),
    held,
  };
}

async function proveAll(units: readonly string[], ports: RollOutPorts) {
  const verdicts: Record<string, TwinVerdict> = {};

  for (const unit of units) {
    try {
      verdicts[unit] = await ports.prove(unit);
    } catch (error) {
      verdicts[unit] = {
        unit,
        passes: 0,
        trials: 0,
        passed: false,
        line: errorMessage(error) || 'The twin couldn’t run Arena.',
      };
    }
  }

  return verdicts;
}

async function sendUnit(unit: string, skill: RollOutSkill, ports: RollOutPorts) {
  const ref: RobotPolicyRef = { kind: 'skill', hash: skill.hash };

  try {
    const message = (await ports.pin(unit, ref)) ?? (await ports.climb(unit));

    return { unit, message };
  } catch (error) {
    return { unit, message: errorMessage(error) || 'The robot couldn’t run the skill.' };
  }
}

interface RollOutInput {
  skill: RollOutSkill;
  units: readonly string[];
  canaries?: readonly string[];
  ports: RollOutPorts;
  onUpdate?: (state: RollOutState) => void;
}

export async function rollOut({ skill, units, canaries, ports, onUpdate }: RollOutInput): Promise<RollOutState> {
  const names = byName(units);
  const chosen = byName(canaries ?? defaultCanaries(names));
  let state: RollOutState = {
    skill,
    stage: 'proving',
    verdicts: {},
    held: {},
    failures: {},
    reached: [],
    stopped: null,
  };
  const update = (change: Partial<RollOutState>) => {
    state = { ...state, ...change };
    onUpdate?.(state);
  };

  onUpdate?.(state);

  const unknown = chosen.find((unit) => !names.includes(unit));

  if (unknown) {
    update({ stage: 'stopped', stopped: { unit: unknown, message: `No selected robot is named ${unknown}.` } });

    return state;
  }

  const verdicts = await proveAll(names, ports);
  const plan = planRollOut({ units: names, canaries: chosen, verdicts });

  update({ verdicts, held: plan.held, stage: 'canaries' });

  for (const [stage, wave] of [
    ['canaries', plan.canaries],
    ['rest', plan.rest],
  ] as const) {
    update({ stage });

    const outcomes = await Promise.all(wave.map((unit) => sendUnit(unit, skill, ports)));
    const failures = outcomes.filter(
      (outcome): outcome is { unit: string; message: string } => outcome.message !== null,
    );
    const failed = failures[0];

    update({
      reached: [
        ...state.reached,
        ...outcomes.filter((outcome) => outcome.message === null).map((outcome) => outcome.unit),
      ],
      failures: {
        ...state.failures,
        ...Object.fromEntries(failures.map((outcome) => [outcome.unit, outcome.message])),
      },
    });

    if (failed || (stage === 'canaries' && !wave.length)) {
      update({ stage: 'stopped', stopped: failed ?? null });

      return state;
    }
  }

  update({ stage: 'done' });

  return state;
}
