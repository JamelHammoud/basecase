import { describe, expect, it } from 'vitest';
import { SkillsRuntime } from '../skills/skillsRuntime';
import { fixtureModel } from '../skills/fixtureModels';
import type { ForgeOutcome } from '../skills/forgeRunner';
import type { SkillRunner } from '../skills/skillsClient';
import { busyLine, trainingProblem } from './trainingProblem';

const model = fixtureModel('quad-servo');

function heldRuntime() {
  const hold = { release: () => {} };
  const runner = (() =>
    new Promise<unknown>((resolve) => {
      hold.release = () =>
        resolve({
          type: 'kit',
          outcome: {
            kind: 'refused',
            reason: 'No pass.',
            relaxation: null,
            cost: { wallS: 0, steps: 0, forgeRuns: 0 },
          },
        });
    })) as SkillRunner;
  const runtime = new SkillsRuntime({
    runner,
    forge: () => () => Promise.resolve<ForgeOutcome>({ ok: true, policy: null, events: [], stderr: '', run: 'r' }),
    save: () => Promise.resolve(),
    loadSkill: () => Promise.resolve(null),
    onRecord: () => {},
    onChange: () => {},
  });

  return { runtime, hold };
}

describe('what a Train click says at once', () => {
  it('starts with nothing to say', async () => {
    const { runtime, hold } = heldRuntime();

    expect(await trainingProblem(runtime, async () => runtime.trainKit(model, 'stand'))).toBeNull();
    expect(runtime.jobs.map((j) => [j.target, j.message])).toEqual([['kit:stand', 'Starting']]);

    hold.release();
    await runtime.settled();
  });

  it('names the skill already training', async () => {
    const { runtime, hold } = heldRuntime();

    runtime.trainKit(model, 'stand');

    expect(await trainingProblem(runtime, async () => runtime.trainKit(model, 'velocity-tracking'))).toBe(
      'Stand is training. Stop it first.',
    );
    expect(busyLine('Stand')).toBe('Stand is training. Stop it first.');

    hold.release();
    await runtime.settled();
  });

  it('says why the scene couldn’t be built', async () => {
    const { runtime } = heldRuntime();

    expect(await trainingProblem(runtime, () => Promise.reject(new Error('The canvas isn’t ready.')))).toBe(
      'The canvas isn’t ready.',
    );
  });
});
