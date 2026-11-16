import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { holdingPolicy } from './hubSkillFixtures';
import { kitJob } from './kitJob';
import type { ForgeOutcome } from './forgeRunner';
import { firstPassingTry } from './kitTries';
import { selectSeeds, selectionOf } from './seedSelection';

const job = kitJob(fixtureModel('quad-servo'), 'stand', { minutes: 2, seed: 1 });
const policies = [holdingPolicy(job), holdingPolicy(job), holdingPolicy(job)];
const grouped = (): ForgeOutcome => ({
  ok: true,
  policy: null,
  events: [{ type: 'done', steps: 30 }],
  stderr: '',
  candidates: policies.map((policy, index) => ({
    id: `policy-${index}`,
    seed: index + 1,
    fingerprint: { 'model.xml': 'model-hash', 'demos.json': 'dataset-hash' },
    policy,
    steps: 10,
    development: { kind: 'cloning-loss', score: -0.1 * (3 - index) },
  })),
});

describe('one development winner before local Arena', () => {
  it('compares all available policies on the same development evaluator and resolves ties by seed order', async () => {
    const evaluate = vi.fn(async (policy) => (policy === policies[0] ? 0 : 1));
    const outcome = await selectSeeds(grouped(), evaluate);

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(outcome.policy).toBe(policies[1]);
    expect(outcome.run).toBe('policy-1');
    expect(selectionOf(outcome.policy!)?.attempts.map((attempt) => attempt.steps)).toEqual([10, 10, 10]);
    expect(selectionOf(outcome.policy!)?.evaluation).toBe('nominal-contract-v1');
  });

  it('uses only the frozen cloning validation loss and tolerates a failed child', async () => {
    const input = grouped();

    input.candidates![2].policy = null;
    input.candidates![2].error = 'Child failed';

    const outcome = await selectSeeds(input);

    expect(outcome.policy).toBe(policies[1]);
    expect(selectionOf(outcome.policy!)?.attempts[2].error).toBe('Child failed');
    expect(selectionOf(outcome.policy!)?.evaluation).toBe('cloning-validation-loss-v1');
  });

  it('returns no candidate when every child failed or evaluation cannot produce a finite score', async () => {
    const input = grouped();

    input.candidates!.forEach((candidate) => (candidate.policy = null));
    expect((await selectSeeds(input)).ok).toBe(false);
    expect((await selectSeeds(grouped(), async () => NaN)).ok).toBe(false);
  });

  it('does not query Arena with a second child or a later try after the selected policy fails', async () => {
    const train = vi.fn(async () => ({ policy: policies[1], folder: 'policy-1' }));
    const judge = vi.fn(async () => ({ skill: null, score: 0 }));
    const skill = await firstPassingTry({
      tries: [
        { seeds: 3, stages: [{ minutes: 2, delaySteps: [0, 1] }] },
        { seeds: 1, stages: [{ minutes: 4, delaySteps: [0, 1] }] },
      ],
      train,
      validate: async () => 1,
      judge,
      aborted: () => false,
      grouped: () => true,
    });

    expect(skill).toBeNull();
    expect(train).toHaveBeenCalledOnce();
    expect(judge).toHaveBeenCalledExactlyOnceWith(policies[1]);
  });
});
