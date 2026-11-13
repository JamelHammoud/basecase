import { describe, expect, it, vi } from 'vitest';
import { fixtureModel } from './fixtureModels';
import type { ForgeOutcome } from './forgeRunner';
import { moveEnvironment } from './moveEnvironment';
import { fixtureMoveSkill, quadSit } from './moveFixtures';
import type { SkillRecord } from './skillRecords';
import type { SkillJob } from './skillRows';
import type { SnapshotRef } from './snapshots';
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
