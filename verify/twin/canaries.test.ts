import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { freshSeed } from '../zoo/rng';
import { familyVerdict, fittedModel, hiddenUnits, inClassUnits, scoreUnit, type UnitScore } from './evaluate';
import { presetModel } from './sim';

describe('Stage 6 canaries: the twin’s controls behave', () => {
  it('canary no-op: a calibrator that returns the preset meets the bar', async () => {
    const mj = await loadMujoco();
    const scores = hiddenUnits(freshSeed(), 'sts3215').map((u) =>
      scoreUnit(mj, 'sts3215', u.logs, (payload) => presetModel('sts3215', payload)),
    );

    expect(familyVerdict(scores).problems).toEqual([]);
  }, 600_000);

  it('canary in-class: a twin inside the training model class, fitted exactly, raises no alarm', async () => {
    const mj = await loadMujoco();
    const scores = inClassUnits(mj, freshSeed(), 'xl330').map((u) =>
      scoreUnit(mj, 'xl330', u.logs, fittedModel(u.unit)),
    );

    expect(familyVerdict(scores).alarm).toBeNull();
  }, 600_000);

  it('canary straddle: gains that straddle zero clear the bootstrap', () => {
    const scores: UnitScore[] = Array.from({ length: 24 }, (_, i) => {
      const reduction = i < 11 ? -0.6 : 0.3;

      return { before: 0.02, after: 0.02 * (1 - reduction), reduction };
    });

    expect(familyVerdict(scores).problems.filter((p) => p.startsWith('Bootstrap'))).toEqual([]);
  });

  it('canary few units: 12 hidden units are enough', () => {
    const scores: UnitScore[] = Array.from({ length: 12 }, () => ({ before: 0.02, after: 0.012, reduction: 0.4 }));

    expect(familyVerdict(scores).problems).toEqual([]);
  });
});
