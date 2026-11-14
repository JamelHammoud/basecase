import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { calibrateServo } from '../../src/reality/calibrate';
import { calibratedInput } from '../../src/reality/calibratedInput';
import { fitPopulation, inBand } from '../../src/reality/population';
import { SERVO_POPULATIONS } from '../../src/reality/servoPopulations';
import type { ServoCalibration } from '../../src/reality/types';
import { buildMjcf } from '../../src/sim/mjcf';
import { freshSeed } from '../zoo/rng';
import { hiddenUnits, scoreUnit } from './evaluate';
import { twinInput } from './sim';
import { median } from './stats';
import { FAMILIES } from './units';

let mj: MainModule;
const seed = freshSeed();

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('servo populations against fresh hidden units', () => {
  for (const family of FAMILIES) {
    it(`${family}: a population fitted from 16 calibrated hidden units holds at least 7 of the other 8 in its 90% band`, async () => {
      const calibrations: ServoCalibration[] = [];

      for (const unit of hiddenUnits(seed, family))
        calibrations.push(await calibrateServo({ family, logs: unit.logs.calibration, mj }));

      const population = fitPopulation(calibrations.slice(0, 16));

      expect(population).not.toBeNull();
      expect(
        calibrations.slice(16).filter((c) => c.verdict === 'measured' && inBand(population!, c.scales)).length,
      ).toBeGreaterThanOrEqual(7);
    }, 1_800_000);

    it(`${family}: the bundled population’s median replays 24 held-out units closer than the catalog preset`, () => {
      const scores = hiddenUnits(seed, family).map((u) =>
        scoreUnit(mj, family, u.logs, (payload) =>
          buildMjcf(calibratedInput(twinInput(family, payload), {}, SERVO_POPULATIONS)),
        ),
      );

      expect(median(scores.map((s) => s.after))).toBeLessThan(median(scores.map((s) => s.before)));
    }, 600_000);
  }
});
