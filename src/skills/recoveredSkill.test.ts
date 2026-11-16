import loadMujoco from '@mujoco/mujoco';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runArena } from './arena';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { holdingPolicy, readyStand } from './hubSkillFixtures';
import { seededRecoveryJob } from './recoverSkill';
import { recoveryFingerprint, SkillRecovery, type RecoveryEntry } from './skillRecovery';
import { skillRecord, type SkillRecord } from './skillRecords';
import type { SkillRunner } from './skillsClient';
import { runSkillsJob } from './skillsJob';
import { SkillsRuntime, type ForgeFactory } from './skillsRuntime';

vi.mock('./arena', async (original) => ({ ...(await original<typeof import('./arena')>()), runArena: vi.fn() }));

const model = fixtureModel('quad-servo');
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

beforeEach(() => vi.clearAllMocks());

function recovered(passed: boolean, cleanupFails = false, grouped = false) {
  const evidence = {
    ...readyStand(model, 'quad').evidence!,
    passed,
    summary: 'Locally checked',
    saltCommitment: 'local-salt',
  };
  const records: SkillRecord[] = [];
  const previous = skillRecord(readyStand(model, 'quad'), { kit: 'stand' });
  let retained = previous;
  const refusals: string[] = [];
  const entry: RecoveryEntry = {
    id: 'workflow',
    judgmentSalt: '12'.repeat(32),
    target: 'kit:stand',
    label: 'Stand',
    context: '',
    fingerprint: recoveryFingerprint(model),
    request: { type: 'worker', job: { type: 'kit', model, design: 'quad', entry: 'stand', seed: 123 } },
  };
  let stored: RecoveryEntry | null = entry;
  const recovery = new SkillRecovery({
    workspaceId: 'scene',
    selected: async () => true,
    store: {
      get: async () => stored,
      put: async (_key, value) => {
        stored = structuredClone(value);
      },
      delete: async () => {
        if (cleanupFails) throw new Error('Journal unavailable');

        stored = null;
      },
      deletePrefix: async () => {},
    },
  });
  const forge = vi.fn<(job: ForgeJob) => Promise<ForgeOutcome>>(async (job) => {
    const policy = holdingPolicy(job.job);
    const candidates = [0, 1].map((index) => ({
      id: `policy-child-${index}`,
      seed: 123 + index,
      fingerprint: { 'model.xml': 'frozen-design' },
      policy,
      steps: 10,
      development: null,
    }));

    return {
      ok: true,
      policy: grouped ? null : policy,
      events: [{ type: 'done', steps: 20, ready: true }],
      stderr: '',
      run: 'policy-remote',
      ...(grouped ? { candidates } : {}),
    };
  });
  const runtime = new SkillsRuntime({
    recovery,
    runner: ((job, ports) => runSkillsJob(job, { ...ports, mj })) as SkillRunner,
    forge: () => forge,
    save: async () => {},
    loadSkill: async () => null,
    onRecord: (record) => {
      records.push(record);
      retained = record;
    },
    onChange: () => {},
    onRefused: (_target, refusal) => {
      if (refusal) refusals.push(refusal.line);
    },
  });

  vi.mocked(runArena).mockResolvedValue(evidence);

  return { runtime, records, refusals, forge, recovery, stored: () => stored, previous, retained: () => retained };
}

describe('local judgment after remote recovery', () => {
  it('leaves workflows without a recovery contract on their existing lifecycle', async () => {
    const state = recovered(true);

    await state.recovery.discard();

    const begin = vi.spyOn(state.recovery, 'begin');
    const factory = vi.fn<ForgeFactory>(() => state.forge);

    state.runtime.replaceForge(factory);
    state.runtime.startJob({ target: 'kit:stand', label: 'Coach' }, async () => {});
    await state.runtime.settled();
    expect(begin).not.toHaveBeenCalled();
    expect(factory.mock.calls[0][0].recoveryKey).toBeUndefined();
  });

  it('keeps fresh local Arena evidence and the original training seed', async () => {
    const state = recovered(true);

    await state.runtime.recover(model);
    await state.runtime.settled();
    expect(state.forge.mock.calls[0][0].job.seed).toBe(123);
    expect(runArena).toHaveBeenCalled();
    expect(state.records).toHaveLength(1);
    expect(state.records[0].evidence?.saltCommitment).toBe('local-salt');
    expect(state.stored()).toBeNull();
  });

  it('rejects a remote ready claim when local Arena refuses the policy', async () => {
    const state = recovered(false);

    await state.runtime.recover(model);
    await state.runtime.settled();
    expect(runArena).toHaveBeenCalled();
    expect(state.records).toHaveLength(0);
    expect(state.refusals.join(' ')).toContain('Arena');
  });

  it('retains grouped provenance after recovery and stops after the selected candidate fails Arena', async () => {
    for (const passed of [true, false]) {
      const state = recovered(passed, false, true);
      const arenaCalls = vi.mocked(runArena).mock.calls.length;

      await state.runtime.recover(model);
      await state.runtime.settled();
      expect(state.forge).toHaveBeenCalledOnce();
      expect(vi.mocked(runArena).mock.calls.length - arenaCalls).toBe(1);
      expect(state.records).toHaveLength(Number(passed));

      if (!passed) expect(state.retained()).toBe(state.previous);

      if (passed) {
        expect(state.records[0].origin?.training?.selected).toBe('policy-child-0');
        expect(state.records[0].origin?.training?.attempts.map((attempt) => attempt.seed)).toEqual([123, 124]);
        expect(state.records[0].origin?.cost.steps).toBe(20);
      }
    }
  });

  it('refuses both an old recovery and a design changed while the remote job finishes', async () => {
    const stale = { ...model, xml: model.xml.replace('damping="', 'damping="9') };
    const before = recovered(true);

    await before.runtime.recover(stale);
    expect(before.forge).not.toHaveBeenCalled();
    expect(before.refusals.join(' ')).toContain('design changed');

    const active = recovered(true, false, true);
    const completed = active.forge.getMockImplementation()!;
    let finish = (_outcome: ForgeOutcome) => {};
    const result = new Promise<ForgeOutcome>((resolve) => {
      finish = resolve;
    });
    let job: Parameters<typeof active.forge>[0] | undefined;

    active.forge.mockImplementation(async (request) => {
      job = request;

      return result;
    });
    await active.runtime.recover(model);
    await vi.waitFor(() => expect(job).toBeDefined());
    await active.runtime.recover(stale);
    finish(await completed(job!));
    await active.runtime.settled();
    expect(active.records).toHaveLength(0);
    expect(active.retained()).toBe(active.previous);
    expect(active.refusals.join(' ')).toContain('design changed');
  });

  it('freezes random training seeds by workflow without changing local training', () => {
    const job = { type: 'kit', model, design: 'quad', entry: 'stand' } as const;

    expect(seededRecoveryJob(job)).toBe(job);
    expect(seededRecoveryJob(job, 'workflow')).toEqual(seededRecoveryJob(job, 'workflow'));
    expect(seededRecoveryJob(job, 'workflow')).not.toEqual(seededRecoveryJob(job, 'other-workflow'));
  });

  it('releases the training row and private workflow state when journal cleanup fails', async () => {
    const state = recovered(true, true);

    await state.runtime.recover(model);
    await state.runtime.settled();
    expect(state.runtime.busy).toBe(false);
    expect(state.runtime.jobs).toEqual([]);
    expect(state.refusals).toContain('Journal unavailable');
    expect(state.recovery.key).toBeUndefined();

    const work = vi.fn(async () => {});

    expect(state.runtime.startJob({ target: 'kit:stand', label: 'Stand' }, work)).toBeNull();
    await state.runtime.settled();
    expect(work).toHaveBeenCalledOnce();
  });
});
