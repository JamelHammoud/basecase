import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import type { ForgeOutcome } from './forgeRunner';
import type { Range } from './environment';
import { moveEnvironment } from './moveEnvironment';
import { fixtureMoveSkill, quadSit } from './moveFixtures';
import { NOMINAL_PHYSICS } from '../sim/physicsScales';
import { recordEnvironment, skillRecord, type SkillRecord } from './skillRecords';
import type { SkillJob } from './skillRows';
import type { SnapshotRef } from './snapshots';
import type { SkillRunner } from './skillsClient';
import type { SkillsJob } from './skillsJob';
import type { StressFinding, StressResult } from './stress';
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

describe('snapshots in the skills runtime', () => {
  const sit = quadSit();
  const skill = fixtureMoveSkill({ model, animation: sit });
  const snapshot = (iteration: number): SnapshotRef => ({ run: 'policy-a', iteration, steps: iteration * 100 });

  function watched() {
    const records: SkillRecord[] = [];
    const seen: Array<SnapshotRef | null> = [];
    const keep = vi.fn((_hash: string, refs: SnapshotRef[]) => Promise.resolve(refs.slice(1)));
    const runner = (async (_job, ports) => {
      await ports.forge({ name: 'Sit', xml: '', job: {} });

      return { type: 'move', outcome: { outcome: { kind: 'skill', skill }, environment: moveEnvironment(model, sit) } };
    }) as SkillRunner;
    const runtime = new SkillsRuntime({
      runner,
      forge:
        ({ onSnapshot }) =>
        () => {
          [1, 2, 3].forEach((i) => onSnapshot?.(snapshot(i * 50)));

          return Promise.resolve<ForgeOutcome>({ ok: true, policy: null, events: [], stderr: '', run: 'policy-a' });
        },
      save: () => Promise.resolve(),
      loadSkill: () => Promise.resolve(null),
      onRecord: (record) => records.push(record),
      onChange: (jobs: SkillJob[]) => seen.push(jobs.find((j) => j.target === `move:${sit.id}`)?.snapshot ?? null),
      snapshots: { load: () => Promise.resolve(null), keep },
    });

    return { runtime, records, seen, keep };
  }

  it('shows the newest snapshot on the training row and keeps what the store copied on the record', async () => {
    const { runtime, records, seen, keep } = watched();

    expect(runtime.trainMove(model, sit)).toBeNull();
    await runtime.settled();

    expect(seen).toContainEqual(snapshot(150));
    expect(keep).toHaveBeenCalledWith(records[0].hash, [snapshot(50), snapshot(100), snapshot(150)]);
    expect(records[0].snapshots).toEqual([snapshot(100), snapshot(150)]);
    expect(runtime.jobs).toEqual([]);
  });
});

describe('stressing a skill in the skills runtime', () => {
  const sit = quadSit();
  const skill = fixtureMoveSkill({ model, animation: sit });
  const environment = moveEnvironment(model, sit);
  const record = skillRecord(skill, { kit: 'stand' });
  const finding: StressFinding = {
    axis: 'mass',
    side: 'above',
    boundary: 1.4,
    point: { ...NOMINAL_PHYSICS, mass: 1.8 },
    start: model.initial,
    margin: -0.5,
  };
  const sample = { point: { ...NOMINAL_PHYSICS }, margin: 0.3, start: 0 };
  const result: StressResult = {
    seed: 'seed',
    budget: 40,
    rollouts: 40,
    nominal: sample,
    axes: [],
    worst: sample,
    starts: [model.initial],
    findings: [finding],
    trace: [sample],
  };
  const stand = { target: 'kit:stand', label: 'Stand', record, skill, environment } as const;

  function stubbed(reply: (job: SkillsJob) => unknown) {
    const records: SkillRecord[] = [];
    const messages: string[] = [];
    const jobs: SkillsJob[] = [];
    const runtime = new SkillsRuntime({
      runner: ((job: SkillsJob) => {
        jobs.push(job);

        return Promise.resolve(reply(job));
      }) as SkillRunner,
      forge: () => () => Promise.resolve<ForgeOutcome>({ ok: false, policy: null, events: [], stderr: '' }),
      save: () => Promise.resolve(),
      loadSkill: () => Promise.resolve(null),
      onRecord: (r) => records.push(r),
      onChange: (list) => messages.push(...list.map((j) => j.message)),
    });

    return { runtime, records, messages, jobs };
  }

  it('runs as the row’s job and keeps the findings on the same record, without the trace', async () => {
    const { runtime, records, messages, jobs } = stubbed(() => ({ type: 'stress', result }));

    expect(await runtime.stress(model, stand, 40)).toEqual(result);
    expect(messages).toContain('Stressing');
    expect(jobs[0]).toMatchObject({ type: 'stress', skill, environment, budget: 40 });
    expect(records).toEqual([{ ...record, stress: { seed: 'seed', budget: 40, rollouts: 40, findings: [finding] } }]);
    expect(runtime.jobs).toEqual([]);
  });

  it('says what holds the runtime instead of stressing', async () => {
    const hold: { release: () => void } = { release: () => {} };
    const { runtime, records } = stubbed(
      () => new Promise((resolve) => (hold.release = () => resolve({ type: 'kit', outcome: REFUSED }))),
    );

    expect(runtime.trainKit(model, 'velocity-tracking')).toBeNull();
    expect(await runtime.stress(model, stand)).toBe('Walk is training.');

    hold.release();
    await runtime.settled();
    expect(records).toEqual([]);
  });

  it('trains on the findings and keeps the new skill as a fresh Stand record', async () => {
    const stressed = {
      ...stand,
      record: { ...record, stress: { seed: 's', budget: 40, rollouts: 40, findings: [finding] } },
    };
    const better = { ...skill, name: 'Stand again' };
    const widened = { ...environment, randomization: { ...environment.randomization, mass: [0.9, 1.8] as Range } };
    const { runtime, records, jobs } = stubbed(() => ({
      type: 'stress-train',
      result: { skill: better, evidence: null, environment: widened, reason: 'Passed.' },
    }));

    expect(await runtime.trainOnStress(model, stressed, { kit: 'stand' })).toEqual(better);
    expect(jobs[0]).toMatchObject({ type: 'stress-train', findings: [finding], target: { kit: 'stand' } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'Stand again', kit: 'stand' });
    expect(records[0].stress).toBeUndefined();
    expect(recordEnvironment(records[0], model)?.randomization.mass).toEqual([0.9, 1.8]);
  });

  it('answers with Arena’s reason and keeps the old record when the retrained skill fails', async () => {
    const reason = 'Passed 20 of 32 held-out tries, in simulation.';
    const { runtime, records } = stubbed(() => ({
      type: 'stress-train',
      result: { skill: null, evidence: null, environment, reason },
    }));

    expect(await runtime.trainOnStress(model, stand, { kit: 'stand' })).toBe(reason);
    expect(records).toEqual([]);
  });
});
