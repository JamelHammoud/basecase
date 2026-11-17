import loadMujoco from '@mujoco/mujoco';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runArena } from './arena';
import { currentDesign, modelHashes, skillFreshness, skillHash } from './artifacts';
import { fixtureModel } from './fixtureModels';
import { holdingPolicy } from './hubSkillFixtures';
import { readyKitSource as readyStand, kitPolicy } from './kitSourceFixtures';
import { kitEnvironment } from './kitEnvironment';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { skillRecord, type SkillRecord } from './skillRecords';
import { SkillRecovery, type RecoveryEntry } from './skillRecovery';
import type { SkillRunner } from './skillsClient';
import { runSkillsJob, type SkillsJob } from './skillsJob';
import { SkillsRuntime, type ForgeFactory } from './skillsRuntime';
import { kitJob } from './kitJob';
import { kitEditModels } from './kitEditFixtures';

vi.mock('./arena', async (original) => ({ ...(await original<typeof import('./arena')>()), runArena: vi.fn() }));

const sourceModel = fixtureModel('quad-servo');
const source = readyStand(sourceModel, sourceModel.robots[0].key);
const sourceText = JSON.stringify(source);
const target = { ...sourceModel, joints: [...sourceModel.joints].reverse() };
const oldRecord = skillRecord(source, { kit: 'stand', model: sourceModel });
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});
beforeEach(() => vi.clearAllMocks());

function setup(remote = false) {
  let sources = [oldRecord];
  const kept: SkillRecord[] = [];
  const requests: SkillsJob[] = [];
  let stored: RecoveryEntry | null = null;
  const recovery = new SkillRecovery({
    workspaceId: 'scene',
    selected: async () => remote,
    store: {
      get: async () => stored,
      put: async (_key, entry) => {
        stored = structuredClone(entry);
      },
      delete: async () => {
        stored = null;
      },
      deletePrefix: async () => {},
    },
  });
  const forge = vi.fn<(job: ForgeJob) => Promise<ForgeOutcome>>(async (job) => ({
    ok: true,
    policy: kitPolicy(job.job),
    events: [{ type: 'done', steps: 20 }],
    stderr: '',
    run: 'policy-local',
  }));
  const load = vi.fn(async (hash: string) => (hash === skillHash(source) ? source : null));
  const factory = vi.fn<ForgeFactory>(() => forge);
  const runtime = new SkillsRuntime({
    recovery,
    kitSources: () => sources,
    loadSkill: load,
    runner: (async (job, ports) => {
      requests.push(structuredClone(job));

      return runSkillsJob(job, { ...ports, mj });
    }) as SkillRunner,
    forge: factory,
    save: async () => {},
    onRecord: (record) => kept.push(record),
    onChange: () => {},
  });

  vi.mocked(runArena).mockResolvedValue(readyStand(target, target.robots[0].key).evidence!);

  return {
    runtime,
    forge,
    factory,
    load,
    kept,
    requests,
    recovery,
    stored: () => stored,
    sources: (next: SkillRecord[]) => {
      sources = next;
    },
  };
}

describe('local warm training through the runtime and worker', () => {
  it.each([true, false])(
    'keeps physics-only Recheck separate from warm retraining when it passes: %s',
    async (passed) => {
      const state = setup();
      const model = kitEditModels('quad-servo').find((edit) => edit.name === 'torso mass')!.model;
      const evidence = readyStand(model, model.robots[0].key).evidence!;

      vi.mocked(runArena)
        .mockResolvedValue(evidence)
        .mockResolvedValueOnce({ ...evidence, passed });
      state.runtime.recheck(model, {
        target: 'kit:stand',
        label: 'Stand',
        kind: 'recheck',
        entry: 'stand',
        move: null,
        record: oldRecord,
      });
      await state.runtime.settled();
      expect(state.requests[0].type).toBe('recheck');
      expect(state.forge).toHaveBeenCalledTimes(passed ? 0 : 1);
      expect(runArena).toHaveBeenCalledTimes(passed ? 1 : 2);
      expect(state.kept).toHaveLength(1);
      expect(state.kept[0].binding.physics).toBe(modelHashes(model).physics);
      expect(state.kept[0].warmStartFrom).toBe(passed ? undefined : oldRecord.hash);
    },
  );

  it('maps the source before dispatch and keeps only target evidence with its source hash', async () => {
    const state = setup();

    expect(state.runtime.trainKit(target, 'stand')).toBeNull();
    await state.runtime.settled();
    expect(state.load).toHaveBeenCalledExactlyOnceWith(oldRecord.hash);
    expect(state.requests[0]).toMatchObject({ type: 'kit', warm: { from: oldRecord.hash } });
    expect(state.forge.mock.calls[0][0].job.warmPolicy).toMatchObject({
      joints: target.joints.map((joint) => joint.id),
    });
    expect(state.kept).toHaveLength(1);
    expect(state.kept[0].warmStartFrom).toBe(oldRecord.hash);
    expect(state.kept[0].binding.topology).toBe(modelHashes(target).topology);
    expect(state.kept[0].kitSource?.joints.map((joint) => joint.id)).toEqual(target.joints.map((joint) => joint.id));
    expect(
      skillFreshness(
        state.kept[0],
        currentDesign({ design: target.robots[0].key, model: target, environment: kitEnvironment(target, 'stand') }),
      ),
    ).toBe('fresh');
    expect(JSON.stringify(source)).toBe(sourceText);
  });

  it('replaces the first input within the existing tries and keeps the ordinary remaining budget', async () => {
    const state = setup();

    vi.mocked(runArena).mockResolvedValue({ ...readyStand(target, target.robots[0].key).evidence!, passed: false });
    state.runtime.trainKit(target, 'stand');
    await state.runtime.settled();
    expect(state.forge.mock.calls.map(([job]) => job.job.minutes)).toEqual([1, 4]);
    expect(state.forge).toHaveBeenCalledTimes(2);
    expect(runArena).toHaveBeenCalledTimes(2);
    expect(state.kept).toHaveLength(0);
  });

  it('uses the ordinary cold path when this scene has no source references', async () => {
    const state = setup();

    state.sources([]);
    state.runtime.trainKit(target, 'stand');
    await state.runtime.settled();
    expect(state.load).not.toHaveBeenCalled();
    expect(state.requests[0]).not.toHaveProperty('warm');
    expect(state.forge.mock.calls[0][0].job.minutes).toBe(2);
  });

  it('uses the same selection in local background training', async () => {
    const state = setup();

    state.runtime.planBackground(target, [
      { target: 'kit:stand', label: 'Stand', kind: 'train', entry: 'stand', move: null, record: oldRecord },
    ]);
    await vi.waitFor(() => expect(state.kept).toHaveLength(1));
    expect(state.requests[0]).toMatchObject({ warm: { from: oldRecord.hash } });
    expect(state.stored()).toBeNull();
    expect(state.factory.mock.calls[0][0]).toMatchObject({ background: true, recoveryKey: undefined });
  });
});

describe('warm source priority and retention', () => {
  it('preempts background source loading for a remote foreground job without dispatching the cancelled source', async () => {
    const state = setup(true);
    let release = (_skill: typeof source) => {};

    state.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    state.runtime.planBackground(target, [
      { target: 'kit:stand', label: 'Stand', kind: 'train', entry: 'stand', move: null, record: oldRecord },
    ]);
    state.runtime.trainKit(target, 'stand');
    state.runtime.planBackground(target, []);
    await state.runtime.settled();
    release(source);
    await vi.waitFor(() => expect(state.factory.mock.calls[0][0].signal.aborted).toBe(true));
    expect(state.requests).toHaveLength(1);
    expect(state.factory.mock.calls[0][0]).toMatchObject({ background: true, recoveryKey: undefined });
    expect(state.factory.mock.calls[1][0].background).toBe(false);
    expect(state.factory.mock.calls[1][0].recoveryKey).toBeTypeOf('string');
  });

  it('honors an explicit installation without selecting a local source or shortening its first input', async () => {
    const state = setup();
    const explicit = { from: 'f'.repeat(64), policy: holdingPolicy(kitJob(target, 'stand', { minutes: 2, seed: 1 })) };

    state.runtime.installKit(target, { entry: 'stand', warm: explicit });
    await state.runtime.settled();
    expect(state.load).not.toHaveBeenCalled();
    expect(state.requests[0]).toMatchObject({ warm: explicit });
    expect(state.forge.mock.calls[0][0].job.minutes).toBe(2);
    expect(state.kept[0].warmStartFrom).toBe(explicit.from);
  });

  it('rejects an edit while the existing foreground recovery preparation yields', async () => {
    const state = setup();

    state.runtime.trainKit(target, 'stand');
    state.runtime.invalidateRecovery();
    await state.runtime.settled();
    expect(state.requests).toHaveLength(0);
    expect(state.kept).toHaveLength(0);
  });

  it('checks the design again after copying retained snapshots', async () => {
    const state = setup();
    const refs = [{ run: 'policy-local', iteration: 1, steps: 20 }];
    let finish = (_refs: typeof refs) => {};
    const keep = vi.fn(
      () =>
        new Promise<typeof refs>((resolve) => {
          finish = resolve;
        }),
    );

    state.runtime.replaceForge(
      ({ onSnapshot }) => {
        onSnapshot?.(refs[0]);

        return state.forge;
      },
      { load: async () => null, keep },
    );
    state.runtime.trainKit(target, 'stand');
    await vi.waitFor(() => expect(keep).toHaveBeenCalledOnce());
    state.runtime.invalidateRecovery();
    finish(refs);
    await state.runtime.settled();
    expect(state.kept).toHaveLength(0);
    expect(JSON.stringify(source)).toBe(sourceText);
  });
});

describe('warm source cancellation and recovery', () => {
  it.each(['prepare', 'load', 'arena', 'stop'])(
    'rejects a changed or stopped Recheck before retraining during %s',
    async (phase) => {
      const state = setup();
      const model = kitEditModels('quad-servo').find((edit) => edit.name === 'torso mass')!.model;

      state.load.mockImplementation(async () => {
        if (phase === 'load') state.runtime.invalidateRecovery();

        return source;
      });
      vi.mocked(runArena).mockImplementation(async () => {
        if (phase === 'arena') state.runtime.invalidateRecovery();

        if (phase === 'stop') state.runtime.stopUser();

        return { ...readyStand(model, model.robots[0].key).evidence!, passed: false };
      });
      state.runtime.recheck(model, {
        target: 'kit:stand',
        label: 'Stand',
        kind: 'recheck',
        entry: 'stand',
        move: null,
        record: oldRecord,
      });

      if (phase === 'prepare') state.runtime.invalidateRecovery();

      await state.runtime.settled();
      expect(state.forge).not.toHaveBeenCalled();
      expect(state.kept).toHaveLength(0);
      expect(state.requests.every((request) => request.type === 'recheck')).toBe(true);
    },
  );

  it('does not retain a warm result after Stop or an edit during loading or training', async () => {
    for (const phase of ['load', 'train', 'stop']) {
      const state = setup();

      if (phase === 'load')
        state.load.mockImplementation(async () => {
          state.runtime.invalidateRecovery();

          return source;
        });
      else
        state.forge.mockImplementation(async (job) => {
          if (phase === 'stop') state.runtime.stopUser();
          else state.runtime.invalidateRecovery();

          return { ok: true, policy: kitPolicy(job.job), events: [], stderr: '' };
        });

      state.runtime.trainKit(target, 'stand');
      await state.runtime.settled();
      expect(state.kept).toHaveLength(0);

      if (phase === 'load') expect(state.forge).not.toHaveBeenCalled();
    }
  });

  it('freezes the selected hash and mapped policy for remote reload without rereading source metadata', async () => {
    const state = setup(true);
    let finish = (_result: ForgeOutcome) => {};

    state.forge.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    state.runtime.trainKit(target, 'stand');
    await vi.waitFor(() => expect(state.stored()).not.toBeNull());

    const frozen = structuredClone(state.stored()!);

    state.runtime.dispose();
    finish({ ok: false, policy: null, events: [], stderr: '' });
    await state.runtime.settled();
    state.sources([]);
    state.load.mockClear();
    state.forge.mockImplementation(async (job) => ({
      ok: true,
      policy: kitPolicy(job.job),
      events: [],
      stderr: '',
    }));
    await state.runtime.recover(target);
    await state.runtime.settled();
    expect(state.requests[1]).toEqual(frozen.request.type === 'worker' ? frozen.request.job : null);
    expect(state.load).not.toHaveBeenCalled();
    expect(state.kept[0]?.warmStartFrom).toBe(oldRecord.hash);
  });
});
