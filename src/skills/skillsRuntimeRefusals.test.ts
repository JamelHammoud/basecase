import { describe, expect, it } from 'vitest';
import { fixtureModel } from './fixtureModels';
import type { ForgeOutcome } from './forgeRunner';
import { quadSit } from './moveFixtures';
import { refusalModel, type SkillRefusal } from './skillRows';
import type { SkillRunner } from './skillsClient';
import { SkillsRuntime } from './skillsRuntime';

const model = fixtureModel('quad-servo');
const NO_UV = 'Training needs uv. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh';
const TRAINED: ForgeOutcome = { ok: true, policy: null, events: [], stderr: '', run: 'r' };
const NO_PASS = 'No Stand policy passed Arena within the Kit’s training budget.';

function refusing(runner: SkillRunner, forgeOutcome: ForgeOutcome) {
  const refusals: Array<[string, SkillRefusal | null]> = [];
  const runtime = new SkillsRuntime({
    runner,
    forge: () => () => Promise.resolve(forgeOutcome),
    save: () => Promise.resolve(),
    loadSkill: () => Promise.resolve(null),
    onRecord: () => {},
    onChange: () => {},
    onRefused: (target, refusal) => refusals.push([target, refusal]),
  });

  return { runtime, refusals };
}

const trainsThenRefuses = (async (_job, ports) => {
  await ports.forge({ name: 'Stand', xml: '', job: {} });

  return {
    type: 'kit',
    outcome: { kind: 'refused', reason: NO_PASS, relaxation: null, cost: { wallS: 1, steps: 0, forgeRuns: 1 } },
  };
}) as SkillRunner;

describe('a Kit or move run that ends without a skill', () => {
  it('shows on the row why the trainer couldn’t start', async () => {
    const { runtime, refusals } = refusing(trainsThenRefuses, { ok: false, policy: null, events: [], stderr: NO_UV });

    expect(runtime.trainKit(model, 'stand')).toBeNull();
    await runtime.settled();

    expect(refusals.at(-1)).toEqual(['kit:stand', { line: NO_UV, model: refusalModel(model) }]);
  });

  it('gives the Kit’s own reason when training ran and no policy passed', async () => {
    const { runtime, refusals } = refusing(trainsThenRefuses, TRAINED);

    runtime.trainKit(model, 'stand');
    await runtime.settled();

    expect(refusals.at(-1)?.[1]?.line).toBe(NO_PASS);
  });

  it('shows the worker’s error on the row when the job throws', async () => {
    const throwing = (() => Promise.reject(new Error('The Motor Kit trains robots that walk on legs.'))) as SkillRunner;
    const { runtime, refusals } = refusing(throwing, TRAINED);
    const sit = quadSit();

    runtime.trainMove(model, sit);
    await runtime.settled();

    expect(refusals.at(-1)).toEqual([
      `move:${sit.id}`,
      { line: 'The Motor Kit trains robots that walk on legs.', model: refusalModel(model) },
    ]);
  });

  it('shows nothing when the user stops it', async () => {
    const waitsForStop = ((_job, ports) =>
      new Promise((_resolve, reject) =>
        ports.signal?.addEventListener('abort', () => reject(new Error('Stopped.'))),
      )) as SkillRunner;
    const { runtime, refusals } = refusing(waitsForStop, TRAINED);

    runtime.trainKit(model, 'stand');
    runtime.stopUser();
    await runtime.settled();

    expect(refusals).toEqual([['kit:stand', null]]);
  });
});
