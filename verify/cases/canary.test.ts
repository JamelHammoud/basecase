import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runCase, touchTheDots } from '../../src/cases/testing';
import { fixtureRobots } from '../../src/sim/fixtures/robots';

describe('canary: a Case with an impossible reference', () => {
  it('claims to pass, and must not', async () => {
    const mj = await loadMujoco();
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const kase = touchTheDots(arm);
    const sabotaged = { ...kase, reference: { timeline: [] } };
    const r = await runCase(mj, sabotaged, arm, { controller: 'reference' });

    expect(r.passed).toBe(true);
  });
});
