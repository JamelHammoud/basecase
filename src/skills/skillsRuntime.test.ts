import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import type { ForgeOutcome } from './forgeRunner';
import type { SkillRunner } from './skillsClient';
import { SkillsRuntime } from './skillsRuntime';

const model = fixtureModel('quad-servo');
const handoffJob = {} as Parameters<SkillsRuntime['trainHandoff']>[0];
const REFUSED = {
  kind: 'refused',
  reason: 'No Walk policy passed Arena.',
  relaxation: null,
  cost: { wallS: 1, steps: 1, forgeRuns: 1 },
};
const row = { target: 'move:wave', label: 'Wave' } as const;

function runtimeWith(runner: SkillRunner) {
  return new SkillsRuntime({
    runner,
    forge: () => () => Promise.resolve<ForgeOutcome>({ ok: true, policy: null, events: [], stderr: '', run: 'r' }),
    save: () => Promise.resolve(),
    loadSkill: () => Promise.resolve(null),
    onRecord: () => {},
    onChange: () => {},
  });
}

describe('training a hand-off in the skills runtime', () => {
  it('says which skill is training when another job holds the runtime', async () => {
    const hold: { release: () => void } = { release: () => {} };
    const runtime = runtimeWith(
      (() =>
        new Promise<unknown>(
          (resolve) => (hold.release = () => resolve({ type: 'kit', outcome: REFUSED })),
        )) as SkillRunner,
    );

    expect(runtime.trainKit(model, 'velocity-tracking')).toBeNull();

    const result = await runtime.trainHandoff(handoffJob, row);

    expect(result).toEqual({ skill: null, proof: null, reason: 'Walk is training.' });

    hold.release();
    await runtime.settled();
  });

  it('gives the worker’s error as the reason when the job throws', async () => {
    const runtime = runtimeWith((() =>
      Promise.reject(new Error('The start states miss a joint the trainer moves.'))) as SkillRunner);

    const result = await runtime.trainHandoff(handoffJob, row);

    expect(result?.reason).toBe('The start states miss a joint the trainer moves.');
    expect(runtime.busy).toBe(false);
  });
});
