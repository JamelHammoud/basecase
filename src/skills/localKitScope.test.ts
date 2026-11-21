import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { readyKitSource as readyStand } from './kitSourceFixtures';
import { kitEditModels } from './kitEditFixtures';
import { measuredKitMapping } from './localKitScope';
import { robotSchema } from './robotSchema';
import { runRuntimeKit } from './runtimeKit';
import { skillRecord } from './skillRecords';
import type { SkillRunner } from './skillsClient';
import type { SkillsJob } from './skillsJob';

const quad = fixtureModel('quad-servo');
const hex = fixtureModel('hexapod');
const biped = fixtureModel('biped-servo');
const tripod = kitEditModels('quad-servo').find((edit) => edit.name === 'remove limb')!.model;
const fiveLegs = kitEditModels('hexapod').find((edit) => edit.name === 'remove limb')!.model;

describe('observed automatic Stand reuse scope', () => {
  it('admits same-count three-joint legs and the observed six-to-five mapping', () => {
    for (const [source, target] of [
      [quad, quad],
      [hex, hex],
      [hex, fiveLegs],
    ])
      expect(measuredKitMapping(robotSchema(source), robotSchema(target))).toBe(true);

    for (const [source, target] of [
      [quad, hex],
      [quad, tripod],
      [hex, quad],
      [biped, biped],
    ])
      expect(measuredKitMapping(robotSchema(source), robotSchema(target))).toBe(false);
  });

  it.each([
    { model: biped, entry: 'stand' as const },
    { model: quad, entry: 'get-up' as const },
    { model: tripod, entry: 'stand' as const },
  ])('uses the cold worker request before artifact IO outside the observed scope', async ({ model, entry }) => {
    const skill = readyStand(model, model.robots[0].key);
    const loadSkill = vi.fn(async () => skill);
    const runner = vi.fn(async (_job: SkillsJob) => ({
      type: 'kit',
      outcome: {
        kind: 'refused',
        reason: 'Controlled refusal',
        relaxation: null,
        cost: { wallS: 0, steps: 0, forgeRuns: 0 },
      },
    }));

    await runRuntimeKit({
      model,
      entry,
      ports: {
        forge: async () => ({ ok: false, policy: null, events: [], stderr: '' }),
        signal: new AbortController().signal,
      },
      infrastructure: () => false,
      deps: {
        runner: runner as SkillRunner,
        save: async () => {},
        loadSkill,
        kitSources: () => [skillRecord(skill, { kit: entry, model })],
      },
    });
    expect(loadSkill).not.toHaveBeenCalled();
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0][0]).not.toHaveProperty('warm');
  });
});
