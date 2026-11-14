import fs from 'node:fs';
import path from 'node:path';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { runArena } from '../../src/skills/arena';
import type { Skill } from '../../src/skills/artifacts';
import { kitEnvironment } from '../../src/skills/kitEnvironment';
import { trainKitEntry } from '../../src/skills/motorKit';
import type { SimModel } from '../../src/sim/mjcfTypes';
import { calibratedUnits, twinPopulation } from '../twin/population';
import { freshSeed } from '../zoo/rng';
import { forgeRunner } from './forge';
import { skillStore, writeJson } from './plans';
import { heldOutTwins, POPULATION_OUT, populationQuad, twinQuad, uniformQuad } from './population';

let mj: MainModule;

beforeAll(async () => {
  fs.rmSync(POPULATION_OUT, { recursive: true, force: true });
  mj = await loadMujoco();
});

async function trainStand(name: string, model: SimModel): Promise<Skill> {
  const dir = path.join(POPULATION_OUT, name);
  const forge = forgeRunner(path.join(dir, 'runs'));
  const store = skillStore(path.join(dir, 'store'));
  const outcome = await trainKitEntry({ mj, design: name, model, entry: 'stand', forge: forge.run, save: store.save });

  writeJson(dir, 'outcome.json', outcome);
  expect(outcome.kind, outcome.kind === 'refused' ? outcome.reason : '').toBe('skill');

  const jobs = forge.records.map((r) => JSON.parse(fs.readFileSync(path.join(r.dir, 'job.json'), 'utf8')));

  expect(jobs.every((job) => 'servoGains' in job)).toBe(name === 'population');

  const { skill } = outcome as Extract<typeof outcome, { kind: 'skill' }>;

  writeJson(dir, 'skill.json', skill);

  return skill;
}

interface Row {
  twin: number;
  skill: string;
  passed: boolean;
  passes: number;
  trials: number;
}

const rate = (rows: Row[], skill: string) => {
  const mine = rows.filter((r) => r.skill === skill);

  return mine.reduce((s, r) => s + r.passes, 0) / mine.reduce((s, r) => s + r.trials, 0);
};

describe('Stand trained against a servo population', () => {
  it('passes Arena on 8 held-out hidden twins, at a rate no worse than Stand trained on uniform ranges', async () => {
    const servos = twinPopulation(await calibratedUnits(mj, freshSeed(), 'sts3215'));
    const population = populationQuad(servos);
    const [first] = heldOutTwins(freshSeed()).map((unit) => twinQuad(unit));
    const firstEnvironment = kitEnvironment(first, 'stand');
    const limp = await runArena({
      mj,
      model: first,
      contract: firstEnvironment.contract,
      controller: { kind: 'limp' },
      environment: firstEnvironment,
    });

    expect(limp.passed, 'a limp quad stands on a hidden twin, so Stand can’t tell the two apart').toBe(false);
    expect(kitEnvironment(population, 'stand').randomization.servos?.length).toBe(1);

    const skills = {
      population: await trainStand('population', population),
      uniform: await trainStand('uniform', uniformQuad(servos)),
    };
    const rows: Row[] = [];

    for (const [twin, unit] of heldOutTwins(freshSeed()).entries()) {
      const model = twinQuad(unit);
      const environment = kitEnvironment(model, 'stand');

      for (const [name, skill] of Object.entries(skills)) {
        const contract = environment.contract;
        const evidence = await runArena({ mj, model, contract, controller: skill.controller, environment });
        const passes = evidence.variants.reduce((s, v) => s + v.passes, 0);
        const trials = evidence.variants.reduce((s, v) => s + v.trials, 0);

        rows.push({ twin, skill: name, passed: evidence.passed, passes, trials });
      }
    }

    const result = { population: rate(rows, 'population'), uniform: rate(rows, 'uniform'), rows };

    writeJson(POPULATION_OUT, 'result.json', result);
    console.log(`Stand on ${rows.length / 2} hidden twins: population ${result.population}, uniform ${result.uniform}`);
    expect(rows.filter((r) => r.skill === 'population' && !r.passed)).toEqual([]);
    expect(result.population).toBeGreaterThanOrEqual(result.uniform);
  }, 3_600_000);
});
