import { expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import { fixtureMoveSkill, quadSit } from './moveFixtures';
import { moveEnvironment } from './moveEnvironment';
import type { SkillRunner } from './skillsClient';
import { runTaughtRace } from './runtimeRace';
import { routeTask, type TaskAnalysis } from './router';
import type { DraftReport } from './teach';
import { SkillsRuntime } from './skillsRuntime';
import { DESIGN_CHANGED } from './skillRecovery';
import type { SkillRecord } from './skillRecords';

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

function localRuntime(stage: 'draft' | 'race') {
  const records: SkillRecord[] = [];
  const runtime: SkillsRuntime = new SkillsRuntime({
    runner: (async (job) => {
      if (job.type === stage) runtime.invalidateRecovery();

      if (job.type === 'draft') return { type: 'draft', result: { ok: true, report } };

      return {
        type: 'race',
        outcome: {
          kind: 'skill',
          skill,
          method: 'ik-or-motion-plan',
          route,
          cost: { wallS: 1, steps: 0 },
          attempts: [],
        },
      };
    }) as SkillRunner,
    forge: () => async () => ({ ok: false, policy: null, events: [], stderr: '' }),
    save: async () => {},
    loadSkill: async () => null,
    onRecord: (record) => records.push(record),
    onChange: () => {},
  });

  return { runtime, records };
}

const request = {
  name: report.draft.name,
  request: report.draft.request,
  seconds: 1,
  goal: { kind: 'open' as const },
  contract: report.draft.environment.contract,
  signals: report.draft.environment.signals,
};

it('rejects a draft returned after a design edit without a remote recovery journal', async () => {
  const { runtime } = localRuntime('draft');

  expect(await runtime.draft(model, request)).toEqual({ ok: false, problems: [DESIGN_CHANGED] });
  expect(runtime.draftOf(report.draft.id)).toBeNull();
});

it('refuses an approved draft after a design edit before the race starts', async () => {
  const { runtime } = localRuntime('race');

  expect((await runtime.draft(model, request)).ok).toBe(true);
  runtime.invalidateRecovery();
  expect(runtime.race(model, report.draft.id)).toBe(DESIGN_CHANGED);
  expect(runtime.busy).toBe(false);
});

it('discards a local taught result returned after a design edit', async () => {
  const { runtime, records } = localRuntime('race');

  expect((await runtime.draft(model, request)).ok).toBe(true);
  expect(runtime.race(model, report.draft.id)).toBeNull();
  await runtime.settled();
  expect(records).toEqual([]);
  expect(runtime.lastRace).toBeNull();
  expect(runtime.busy).toBe(false);
});
