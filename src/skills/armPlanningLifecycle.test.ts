import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { dividerModel } from './armMotionFixtures';
import { armReachRequest } from './armPlanningPipeline';
import { planReach, reachCandidate, reachPlanKey } from './raceIk';
import { draftGoal } from './teachEnvironment';
import { SkillsRuntime } from './skillsRuntime';
import { runSkillsJob } from './skillsJob';
import type { SkillRunner } from './skillsClient';
import type { SkillRecord } from './skillRecords';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

it('replays a deterministic seed through endpoint solving and searched animation keys', async () => {
  const model = dividerModel();
  const goal = draftGoal(armReachRequest(mj, model, { arm0: 60, arm1: 0, arm2: 0 }).goal);

  if (goal.kind !== 'reach') throw new Error('Expected reach');

  const a = await planReach(mj, model, { ...goal, horizonS: 10, seed: 1812 });
  const b = await planReach(mj, model, { ...goal, horizonS: 10, seed: 1812 });

  expect(a.controller).not.toBeNull();
  expect(b).toEqual(a);
});

it.each(['stop', 'edit'])('discards an active production search after %s', async (action) => {
  const model = dividerModel();
  const records: SkillRecord[] = [];
  const saved: string[] = [];
  let interrupted = false;
  const runner = ((job, ports) => {
    const pending = runSkillsJob(job.type === 'race' ? { ...job, seed: 29 } : job, { ...ports, mj });

    if (job.type === 'race')
      setTimeout(() => {
        interrupted = true;

        if (action === 'edit') runtime.invalidateRecovery();
        else runtime.stopUser();
      }, 0);

    return pending;
  }) as SkillRunner;

  const runtime: SkillsRuntime = new SkillsRuntime({
    runner,
    forge: () => async () => {
      throw new Error('Arm must not train');
    },
    save: async (_path, text) => {
      saved.push(text);
    },
    loadSkill: async () => null,
    onRecord: (record) => {
      records.push(record);
    },
    onChange: () => {},
  });

  const draft = await runtime.draft(model, armReachRequest(mj, model, { arm0: 60, arm1: 0, arm2: 0 }));

  expect(draft.ok).toBe(true);

  if (!draft.ok) throw new Error(draft.problems.join(' '));

  expect(runtime.race(model, draft.report.draft.id)).toBeNull();
  await runtime.settled();
  expect(interrupted).toBe(true);
  expect(records).toEqual([]);
  expect(saved).toEqual([]);
  expect(runtime.busy).toBe(false);
  expect(runtime.lastRace).toBeNull();
});

it('binds bounded preview candidates to geometry, initial pose and the requested motion', () => {
  const model = dividerModel();
  const context = {
    part: 'link2',
    waypoints: [{ point: [0, 0, 0.2] as [number, number, number], holdS: 1 }],
    horizonS: 10,
  };
  const plan = { controller: null, reason: 'No motion was found within the search budget.', missM: Infinity };
  const candidate = reachCandidate(model, context, plan)!;

  expect(JSON.parse(JSON.stringify(candidate))).toEqual(candidate);
  expect(candidate.key).toBe(reachPlanKey(model, context));
  expect(candidate.seed).toBe(1812);
  expect(reachPlanKey({ ...model, initial: { values: { ...model.initial.values, arm0: 10 } } }, context)).not.toBe(
    candidate.key,
  );
  expect(reachPlanKey({ ...model, collisionGeometry: { fallbackParts: ['link2'] } }, context)).not.toBe(candidate.key);
  expect(reachPlanKey({ ...model, xml: model.xml.replace('timestep="0.002"', 'timestep="0.001"') }, context)).not.toBe(
    candidate.key,
  );
  expect(reachPlanKey(model, { ...context, horizonS: 8 })).not.toBe(candidate.key);
  expect(reachPlanKey(model, { ...context, start: { values: { arm0: 0 } } })).not.toBe(candidate.key);
});
