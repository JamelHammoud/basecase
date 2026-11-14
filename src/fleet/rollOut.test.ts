import { describe, expect, it } from 'vitest';
import { defaultCanaries, planRollOut, rollOut, type RollOutPorts } from './rollOut';
import { rollOutText } from './rollOutText';
import type { TwinVerdict } from './twinArena';

const SKILL = { hash: 'b'.repeat(64), label: 'Reach' };
const UNITS = ['arm-3', 'arm-1', 'arm-2', 'arm-4'];
const WEAK = 'arm-3';
const SAGS = 'Shoulder sags';

function seededTwins(seed: number): Record<string, TwinVerdict> {
  return Object.fromEntries(
    UNITS.map((unit, k) => {
      const passes = unit === WEAK ? 3 + (seed % 5) : 30 + ((seed + k) % 3);

      return [
        unit,
        { unit, passes, trials: 32, passed: unit !== WEAK, line: unit === WEAK ? SAGS : `${passes} of 32` },
      ];
    }),
  );
}

function fakePorts(twins: Record<string, TwinVerdict>, refuse: Record<string, string> = {}) {
  const log: string[] = [];
  const ports: RollOutPorts = {
    prove: async (unit) => {
      log.push(`prove ${unit}`);

      return twins[unit];
    },
    pin: async (unit, ref) => {
      log.push(`pin ${unit} ${ref.kind === 'skill' ? ref.hash.slice(0, 4) : ref.id}`);

      return null;
    },
    climb: async (unit) => {
      await new Promise((resolve) => setTimeout(resolve, unit === 'arm-1' ? 5 : 1));
      log.push(`climb ${unit}`);

      return refuse[unit] ?? null;
    },
  };

  return { ports, log };
}

describe('Roll Out', () => {
  it('picks one canary for a small fleet and two for a larger one, by name', () => {
    expect(defaultCanaries(['b', 'a', 'c'])).toEqual(['a']);
    expect(defaultCanaries(UNITS)).toEqual(['arm-1', 'arm-2']);
    expect(defaultCanaries(['b', 'a', 'b', 'a'])).toEqual(['a']);
  });

  it('reaches the canaries first, then the units whose twin passes', async () => {
    const { ports, log } = fakePorts(seededTwins(1));
    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1'], ports });
    const restPinned = log.indexOf('pin arm-2 bbbb');

    expect(state.stage).toBe('done');
    expect(state.reached).toEqual(['arm-1', 'arm-2', 'arm-4']);
    expect(log.indexOf('climb arm-1')).toBeLessThan(restPinned);
    expect(log.slice(0, 4)).toEqual(['prove arm-1', 'prove arm-2', 'prove arm-3', 'prove arm-4']);
  });

  it('holds back the unit whose twin fails, with Arena’s failing line, and never sends it the skill', async () => {
    const { ports, log } = fakePorts(seededTwins(2));
    const state = await rollOut({ skill: SKILL, units: UNITS, ports });

    expect(state.held).toEqual({ [WEAK]: SAGS });
    expect(log.some((l) => l.startsWith(`pin ${WEAK}`) || l.startsWith(`climb ${WEAK}`))).toBe(false);
    expect(rollOutText(state)).toContain(`${WEAK}: 5 of 32 in its twin, held back: ${SAGS}.`);
  });

  it('stops before the rest when a canary refuses to climb, and keeps their versions', async () => {
    const { ports, log } = fakePorts(seededTwins(3), { 'arm-2': 'Load a policy first.' });
    const state = await rollOut({ skill: SKILL, units: UNITS, ports });

    expect(state.stage).toBe('stopped');
    expect(state.stopped).toEqual({ unit: 'arm-2', message: 'Load a policy first.' });
    expect(state.reached).toEqual(['arm-1']);
    expect(state.failures).toEqual({ 'arm-2': 'Load a policy first.' });
    expect(log.some((l) => l.startsWith('pin arm-4'))).toBe(false);
  });

  it('records every failed unit and successful peer in a partial rest wave', async () => {
    const { ports, log } = fakePorts(seededTwins(3));
    const pin = ports.pin;

    ports.pin = async (unit, ref) => {
      if (unit === 'arm-2') throw new Error('Policy upload failed.');

      return pin(unit, ref);
    };
    ports.climb = async (unit) => {
      if (unit === 'arm-4') throw new Error('Link closed.');

      return null;
    };

    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1'], ports });

    expect(state.stage).toBe('stopped');
    expect(state.reached).toEqual(['arm-1']);
    expect(state.failures).toEqual({ 'arm-2': 'Policy upload failed.', 'arm-4': 'Link closed.' });
    expect(state.stopped).toEqual({ unit: 'arm-2', message: 'Policy upload failed.' });
    expect(log).toContain('pin arm-4 bbbb');
    expect(rollOutText(state)).toContain('arm-4: 30 of 32 in its twin, Link closed.');
  });

  it('keeps the reached rest units when a peer refuses', async () => {
    const { ports } = fakePorts(seededTwins(3), { 'arm-2': 'Load limit.' });
    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1'], ports });

    expect(state.stage).toBe('stopped');
    expect(state.reached).toEqual(['arm-1', 'arm-4']);
    expect(state.failures).toEqual({ 'arm-2': 'Load limit.' });
  });

  it('never climbs after a policy pin refuses, including an empty refusal message', async () => {
    const { ports, log } = fakePorts(seededTwins(3));

    ports.pin = async () => '';

    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1'], ports });

    expect(state.stage).toBe('stopped');
    expect(state.reached).toEqual([]);
    expect(state.failures).toEqual({ 'arm-1': '' });
    expect(log.some((line) => line.startsWith('climb'))).toBe(false);
    expect(rollOutText(state)).toContain('Stopped at arm-1: The robot couldn’t run the skill.');
  });

  it('holds a unit whose twin throws and still proves and sends the passing units', async () => {
    const { ports, log } = fakePorts(seededTwins(3));
    const prove = ports.prove;

    ports.prove = async (unit) => {
      if (unit === WEAK) throw new Error('The twin model could not load.');

      return prove(unit);
    };

    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1'], ports });

    expect(state.stage).toBe('done');
    expect(state.held).toEqual({ [WEAK]: 'The twin model could not load.' });
    expect(state.verdicts[WEAK]).toMatchObject({ unit: WEAK, passed: false, trials: 0 });
    expect(state.reached).toEqual(['arm-1', 'arm-2', 'arm-4']);
    expect(log).toContain('prove arm-4');
    expect(log.some((line) => line.startsWith(`pin ${WEAK}`))).toBe(false);
  });

  it('refuses a named canary outside the selected units before proving or changing any unit', async () => {
    const { ports, log } = fakePorts(seededTwins(3));
    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: ['arm-1', 'missing'], ports });

    expect(state.stage).toBe('stopped');
    expect(state.stopped?.unit).toBe('missing');
    expect(state.reached).toEqual([]);
    expect(log).toEqual([]);
  });

  it('never falls back to default canaries when the chosen list is empty', async () => {
    const { ports, log } = fakePorts(seededTwins(3));
    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: [], ports });

    expect(state.stage).toBe('stopped');
    expect(state.reached).toEqual([]);
    expect(log.some((line) => line.startsWith('pin'))).toBe(false);
  });

  it('stops when no canary passes its twin', async () => {
    const { ports } = fakePorts(seededTwins(4));
    const state = await rollOut({ skill: SKILL, units: UNITS, canaries: [WEAK], ports });

    expect(state.stage).toBe('stopped');
    expect(state.reached).toEqual([]);
  });

  it('gives the same rollout for the same seeds', async () => {
    const run = async () => rollOut({ skill: SKILL, units: UNITS, ports: fakePorts(seededTwins(7)).ports });

    expect(await run()).toEqual(await run());
    expect(planRollOut({ units: UNITS, canaries: ['arm-2'], verdicts: seededTwins(7) })).toEqual({
      canaries: ['arm-2'],
      rest: ['arm-1', 'arm-4'],
      held: { [WEAK]: SAGS },
    });
  });
});
