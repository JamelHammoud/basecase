import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { freshSeed } from '../zoo/rng';
import { saveHidden } from './calibrate';
import { familyVerdict, fittedModel, hiddenUnits, scoreUnit, TWIN_BARS } from './evaluate';
import { FAMILIES } from './units';

describe('the hidden twin is fair: the bar is reachable and the twin sits outside the training model', () => {
  for (const family of FAMILIES) {
    it(`${family}: fresh hidden units each run; their true in-model parameters cut error 25 to 90%`, async () => {
      const mj = await loadMujoco();
      const seed = freshSeed();
      const units = hiddenUnits(seed, family);
      const other = hiddenUnits(freshSeed(), family);
      const scores = units.map((u) => scoreUnit(mj, family, u.logs, fittedModel(u.unit)));
      const verdict = familyVerdict(scores);

      saveHidden(`self-check-${family}.json`, { units: units.map((u) => u.unit), metrics: verdict.metrics });
      expect(units.length).toBeGreaterThanOrEqual(TWIN_BARS.minUnits);
      expect(JSON.stringify(units[0].unit)).not.toBe(JSON.stringify(other[0].unit));
      expect(verdict.alarm).toBeNull();
      expect(verdict.problems).toEqual([]);
    }, 600_000);
  }
});
