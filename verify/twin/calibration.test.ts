import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { freshSeed } from '../zoo/rng';
import { calibratedModel, loadCalibrator, saveHidden, shuffledLogs, type CalibrateModule } from './calibrate';
import { familyVerdict, hiddenUnits, presetUnits, scoreUnit, type HiddenUnit } from './evaluate';
import { FAMILIES, type Family } from './units';

const BAR_PROBLEMS = /^(Median tracking|Median error|Bootstrap)/;

let mj: MainModule;
let mod: CalibrateModule;
const seed = freshSeed();
const units = new Map<Family, HiddenUnit[]>();

beforeAll(async () => {
  mod = await loadCalibrator();
  mj = await loadMujoco();

  for (const family of FAMILIES) units.set(family, hiddenUnits(seed, family));

  saveHidden(
    `calibration-${seed.slice(0, 12)}.json`,
    Object.fromEntries([...units].map(([f, u]) => [f, u.map((x) => x.unit)])),
  );
}, 600_000);

async function scored(family: Family, logsFor: (i: number) => HiddenUnit['logs']['calibration']) {
  const mine = units.get(family)!;
  const verdicts: string[] = [];
  const scores = [];

  for (const [i, u] of mine.entries()) {
    const calibration = await mod.calibrateServo({ family, logs: logsFor(i) });

    verdicts.push(calibration.verdict);
    scores.push(scoreUnit(mj, family, u.logs, calibratedModel(mod, family, calibration)));
  }

  return { verdict: familyVerdict(scores), verdicts };
}

describe('Stage 6: calibration against the hidden twin', () => {
  for (const family of FAMILIES) {
    it(`${family}: median held-out tracking error down at least 25%, bootstrap CI above zero, no implausible gain`, async () => {
      const { verdict } = await scored(family, (i) => units.get(family)![i].logs.calibration);

      saveHidden(`result-${family}-${seed.slice(0, 12)}.json`, verdict.metrics);
      expect(verdict.problems).toEqual([]);
    }, 1_800_000);

    it(`${family}: logs shuffled across units and time fail the bar and never read as measured`, async () => {
      const all = units.get(family)!.map((u) => u.logs);
      const { verdict, verdicts } = await scored(family, (i) => shuffledLogs(all, i, seed));

      expect(verdict.problems.some((p) => BAR_PROBLEMS.test(p))).toBe(true);
      expect(verdicts.filter((v) => v === 'measured')).toEqual([]);
    }, 1_800_000);

    it(`${family}: logs from the catalog preset itself read as consistent with the preset`, async () => {
      const verdicts: string[] = [];

      for (const u of presetUnits(mj, seed, family)) {
        verdicts.push((await mod.calibrateServo({ family, logs: u.logs.calibration })).verdict);
      }

      expect(verdicts.filter((v) => v !== 'consistent')).toEqual([]);
    }, 900_000);
  }
});
