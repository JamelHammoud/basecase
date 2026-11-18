import { expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { fixtureMoveSkill, quadSit } from './moveFixtures';
import { moveEnvironment } from './moveEnvironment';
import type { SkillRunner } from './skillsClient';
import { runTaughtRace } from './runtimeRace';
import { routeTask, type TaskAnalysis } from './router';
import type { DraftReport } from './teach';

const model = fixtureModel('quad-servo');
const animation = quadSit();
const skill = fixtureMoveSkill({ model, animation });
const analysis: TaskAnalysis = {
  simCanCheck: true,
  quasiStatic: true,
  motionShapeMatters: false,
  kitSkills: null,
  stateDimension: 6,
  contactRich: false,
  trajectoryOptimisation: 'not-tried',
  rewardSearchRounds: 0,
  demo: 'not-asked',
};
const route = routeTask(analysis);
const report: DraftReport = {
  draft: {
    id: 'reach',
    name: 'Reach',
    request: 'Reach around the divider',
    design: 'robot',
    environment: moveEnvironment(model, animation),
    goal: { kind: 'open' },
    analysis,
    rewards: null,
  },
  words: [],
  route,
  rollouts: [],
  warnings: [],
  relaxation: null,
};

function execution() {
  let current = true;
  const signal = new AbortController();
  const assertCurrent = () => {
    signal.signal.throwIfAborted();

    if (!current) throw new Error('changed');
  };
  const save = vi.fn(async () => {});
  const keep = vi.fn(async (_target, _record, guard: () => void) => guard());
  const onRace = vi.fn();
  const runner = (async (_job, ports) => {
    await ports.save('skill.json', JSON.stringify(skill));

    return {
      type: 'race',
      outcome: { kind: 'skill', skill, method: 'ik-or-motion-plan', route, cost: { wallS: 1, steps: 0 }, attempts: [] },
    };
  }) as SkillRunner;

  return {
    input: {
      model,
      report,
      runner,
      assertCurrent,
      keep,
      onRace,
      ports: { signal: signal.signal, save, forge: async () => ({ ok: false, policy: null, events: [], stderr: '' }) },
    },
    save,
    keep,
    onRace,
    signal,
    edit: () => {
      current = false;
    },
  };
}

it('retains a current ordinary skill and publishes the existing race report', async () => {
  const run = execution();

  await runTaughtRace(run.input);
  expect(run.save).toHaveBeenCalledOnce();
  expect(run.keep).toHaveBeenCalledOnce();
  expect(run.onRace).toHaveBeenCalledWith(expect.objectContaining({ found: true, name: 'Reach' }));
});

it.each(['before-save', 'after-save', 'during-keep', 'cancelled'])(
  'refuses stale or cancelled results at %s',
  async (stage) => {
    const run = execution();
    const original = run.input.runner;

    run.input.runner = (async (job, ports) => {
      if (stage === 'before-save') run.edit();

      const reply = await original(job, ports);

      if (stage === 'after-save') run.edit();

      if (stage === 'cancelled') run.signal.abort();

      return reply;
    }) as SkillRunner;

    if (stage === 'during-keep')
      run.keep.mockImplementationOnce(async (_target, _record, guard) => {
        run.edit();
        guard();
      });

    await expect(runTaughtRace(run.input)).rejects.toThrow();
    expect(run.onRace).not.toHaveBeenCalled();
  },
);
