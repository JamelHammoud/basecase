import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { calibratedInput } from '../../src/reality/calibratedInput';
import { inBand } from '../../src/reality/population';
import type { ServoCalibration } from '../../src/reality/types';
import { buildMjcf } from '../../src/sim/mjcf';
import { freshSeed } from '../zoo/rng';
import { hiddenUnits, scoreUnit } from './evaluate';
import { calibratedUnits, twinPopulation } from './population';
import { twinInput } from './sim';
import { median } from './stats';
import { FAMILIES } from './units';

let mj: MainModule;
const seed = freshSeed();
const heldOutSeed = freshSeed();

beforeAll(async () => {
  mj = await loadMujoco();
});

for (const family of FAMILIES)
  describe(`${family} populations against fresh hidden units`, () => {
    let calibrations: ServoCalibration[] = [];

    beforeAll(async () => {
      calibrations = await calibratedUnits(mj, seed, family);
    }, 1_800_000);

    it(`${family}: a population fitted from 16 calibrated hidden units holds at least 7 of the other 8 in its 90% band`, () => {
      const population = twinPopulation(calibrations.slice(0, 16));

      expect(
        calibrations.slice(16).filter((c) => c.verdict === 'measured' && inBand(population, c.scales)).length,
      ).toBeGreaterThanOrEqual(7);
    });

    it(`${family}: the median of all 24 replays 24 other fresh units closer than the catalog preset`, () => {
      const population = twinPopulation(calibrations);
      const scores = hiddenUnits(heldOutSeed, family).map((u) =>
        scoreUnit(mj, family, u.logs, (payload) =>
          buildMjcf(calibratedInput(twinInput(family, payload), {}, [population])),
        ),
      );

      expect(median(scores.map((s) => s.after))).toBeLessThan(median(scores.map((s) => s.before)));
    }, 600_000);
  });
