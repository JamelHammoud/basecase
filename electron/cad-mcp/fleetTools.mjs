import { z } from 'zod';
import { MAX_UNITS } from '../robot/units.mjs';
import { bridge, fail, text } from './shared.mjs';

export const unitName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/)
  .describe('A connected robot unit’s name as Operate lists it, e.g. "robot-2"');

const ask = async (kind, args, timeoutMs) => {
  try {
    const res = await bridge(kind, args, timeoutMs);

    return text(res?.text ?? res);
  } catch (err) {
    return fail(err);
  }
};

export const rollOut = {
  name: 'roll_out',
  config: {
    title: 'Roll out a skill',
    description:
      'Rolls a ready skill out to the connected robot units in Operate. Arena first proves it on each unit’s own calibrated twin. ' +
      'Canaries go first (by default the first unit by name when three or fewer are connected, else the first two), then every unit whose twin passes. A unit whose twin fails is held back with Arena’s failing contract line. ' +
      'Each unit stays pinned to its version until roll_back. The reply lists each unit’s pass count and outcome.',
    inputSchema: {
      skill: z.string().min(1).max(60).describe('The ready skill’s name as list_skills shows it, e.g. "Walk"'),
      canaries: z.array(unitName).max(MAX_UNITS).optional().describe('The units that get it first'),
      units: z.array(unitName).max(MAX_UNITS).optional().describe('The units to roll out to, default every one'),
    },
  },
  handler: (args) => ask('roll_out', args, 600000),
};

export const rollBack = {
  name: 'roll_back',
  config: {
    title: 'Roll back a unit',
    description:
      'Returns one connected robot unit in Operate to the policy version it ran before, and rechecks it. Refused when the unit has nothing to roll back to.',
    inputSchema: {
      unit: unitName,
    },
  },
  handler: (args) => ask('roll_back', args, 60000),
};
