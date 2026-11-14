import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { inBand, POPULATION } from '../../src/reality/population';
import { runArena } from '../../src/skills/arena';
import { kitEnvironment } from '../../src/skills/kitEnvironment';
import { freshSeed } from '../zoo/rng';
import { hiddenUnits, scoreUnit } from '../twin/evaluate';
import { calibratedUnits, twinPopulation } from '../twin/population';
import { presetModel } from '../twin/sim';
import { median } from '../twin/stats';
import { heldOutTwins, twinQuad } from './population';

describe('servo population canaries', () => {
  it('canary narrow: a population with no spread holds 7 of 8 held-out units in its band', async () => {
    const calibrations = await calibratedUnits(await loadMujoco(), freshSeed(), 'sts3215');
    const fitted = twinPopulation(calibrations.slice(0, 16));
    const narrow = {
      ...fitted,
      covariance: fitted.covariance.map((row, i) => row.map((_, j) => (i === j ? POPULATION.floorLog ** 2 : 0))),
    };

    expect(calibrations.slice(16).filter((c) => inBand(narrow, c.scales)).length).toBeGreaterThanOrEqual(7);
  }, 1_800_000);

  it('canary preset: the catalog preset replays held-out units closer than itself', async () => {
    const mj = await loadMujoco();
    const scores = hiddenUnits(freshSeed(), 'sts3215')
      .slice(0, 8)
      .map((u) => scoreUnit(mj, 'sts3215', u.logs, (payload) => presetModel('sts3215', payload)));

    expect(median(scores.map((s) => s.after))).toBeLessThan(median(scores.map((s) => s.before)));
  }, 600_000);

  it('canary limp: a limp quad passes Arena on a hidden twin', async () => {
    const mj = await loadMujoco();
    const [unit] = heldOutTwins(freshSeed());
    const model = twinQuad(unit);
    const environment = kitEnvironment(model, 'stand');
    const evidence = await runArena({
      mj,
      model,
      contract: environment.contract,
      controller: { kind: 'limp' },
      environment,
    });

    expect(evidence.passed).toBe(true);
  }, 600_000);
});
