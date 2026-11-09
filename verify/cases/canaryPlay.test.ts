import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runCase, touchTheDots } from '../../src/cases/testing';
import { playProblems, playRobot } from './play';

describe('Stage 2 play canaries: the margin judge rejects a planted fault', () => {
  it('canary limp: a runner whose limp is really the reference passes the margin check', async () => {
    const mj = await loadMujoco();
    const arm = playRobot('arm-3dof');
    const kase = touchTheDots(arm);
    const reference = await runCase(mj, kase, arm, { controller: 'reference' });

    if (!reference.passed) throw new Error('setup: the reference run must pass for this canary to mean anything');

    expect(playProblems(reference, reference, reference)).toEqual([]);
  }, 300_000);
});
