import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { freshSeed } from '../zoo/rng';
import { loadCalibrator } from './calibrate';
import { calibratorFitter, runSession, type Fitter, type Session } from './session';
import { FAMILIES } from './units';

const BAR_PROBLEMS = /^(Median tracking|Median error|Bootstrap)/;

let mj: MainModule;
let fitter: Fitter;
const seed = freshSeed();

beforeAll(async () => {
  fitter = calibratorFitter(await loadCalibrator());
  mj = await loadMujoco();
}, 600_000);

describe('Stage 6: calibration against the hidden twin', () => {
  for (const family of FAMILIES) {
    describe(family, () => {
      let session: Session;

      beforeAll(async () => {
        session = await runSession({ mj, seed, family, fitter });
      }, 3_600_000);

      it(`${family}: median held-out tracking error down at least 25%, bootstrap CI above zero, no implausible gain`, () => {
        expect(session.own.verdict.problems).toEqual([]);
      });

      it(`${family}: logs shuffled across units and time fail the bar and never read as measured`, () => {
        expect(session.shuffled!.verdict.problems.some((p) => BAR_PROBLEMS.test(p))).toBe(true);
        expect(session.shuffled!.verdicts.filter((v) => v === 'measured')).toEqual([]);
      });

      it(`${family}: logs from the catalog preset itself read as consistent with the preset`, () => {
        expect(session.preset.length).toBeGreaterThan(0);
        expect(session.preset.filter((v) => v !== 'consistent')).toEqual([]);
      });
    });
  }
});
