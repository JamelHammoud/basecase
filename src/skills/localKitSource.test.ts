import { describe, expect, it, vi } from 'vitest';
import { skillHash } from './artifacts';
import { fixtureModel } from './fixtureModels';
import { readyKitSource as readyStand } from './kitSourceFixtures';
import { localKitWarm, selectKitSource } from './localKitSource';
import { kitJob } from './kitJob';
import { skillRecord } from './skillRecords';
import { policyObsSize, type PolicySpec } from '../sim/policy';
import { isRunnablePolicy } from './policyCheck';
import { holdingPolicy } from './hubSkillFixtures';

const model = fixtureModel('quad-servo');
const design = model.robots[0].key;
const skill = readyStand(model, design);
const record = skillRecord(skill, { kit: 'stand', model });
const options = { model, entry: 'stand' as const };

function extraObservations(policy: PolicySpec, fields: Pick<PolicySpec, 'eyes' | 'clock'>): PolicySpec {
  const spec = { ...policy, ...fields };
  const width = policyObsSize(spec);

  return {
    ...spec,
    obsMean: Array<number>(width).fill(0),
    obsStd: Array<number>(width).fill(1),
    layers: spec.layers.map((layer, index) =>
      index === 0 ? { ...layer, in: width, w: Array<number>(width * layer.out).fill(0) } : layer,
    ),
  };
}

describe('local Motor Kit source selection', () => {
  it('keeps source schema and the seed hash in ordinary metadata', () => {
    expect(record.kitSource?.joints.map((joint) => joint.id)).toEqual(skill.action.joints);
    expect(skillRecord({ ...skill, warmStartFrom: record.hash }, { kit: 'stand', model }).warmStartFrom).toBe(
      record.hash,
    );
    expect(skillRecord(skill, { kit: 'stand' }).kitSource).toBeUndefined();
  });

  it('selects deterministically by compatibility, recency and hash without loading candidates', () => {
    const older = { ...record, createdAt: '2026-11-01', hash: '1'.repeat(64) };
    const newer = { ...record, createdAt: '2026-11-02', hash: '2'.repeat(64) };
    const tied = { ...newer, hash: '0'.repeat(64) };

    expect(selectKitSource([older, newer, tied], options)).toBe(tied);
    expect(selectKitSource([tied, newer, older], options)).toBe(tied);
    expect(selectKitSource([newer, older], options)).toBe(newer);
  });

  it('refuses legacy metadata, other tasks and unproved records', () => {
    const { kitSource: omitted, ...legacy } = record;

    expect(omitted).toBeDefined();

    for (const candidate of [
      legacy,
      { ...record, kit: 'get-up' as const },
      { ...record, evidence: null },
      { ...record, origin: null },
      { ...record, evidence: { ...record.evidence!, passed: false } },
    ])
      expect(selectKitSource([candidate], options)).toBeNull();
  });

  it('prefers the current robot but can reuse a scene reference after removing its root limb', () => {
    const previousRobot = { ...record, binding: { ...record.binding, design: 'previous-root' }, createdAt: '9999' };

    expect(selectKitSource([previousRobot, record], options)).toBe(record);
    expect(selectKitSource([previousRobot], options)).toBe(previousRobot);
  });

  it('maps only the selected artifact and preserves it unchanged', async () => {
    const before = JSON.stringify(skill);
    const load = vi.fn(async () => skill);
    const target = { ...model, joints: [...model.joints].reverse() };
    const warm = await localKitWarm({ ...options, model: target, records: [record], load });
    const job = kitJob(target, 'stand', { minutes: 1, seed: 1 });

    expect(load).toHaveBeenCalledExactlyOnceWith(skillHash(skill));
    expect(warm?.from).toBe(record.hash);
    expect(warm?.policy.joints).toEqual(job.joints.map((joint) => joint.id));
    expect(warm?.policy.defaultPose).toEqual(job.defaultPose);
    expect(JSON.stringify(skill)).toBe(before);
  });

  it('uses the cold path after one missing, corrupt or unreadable selected artifact', async () => {
    const newer = { ...record, createdAt: '9999', hash: '1'.repeat(64) };

    for (const result of [null, { ...skill, name: 'corrupt' }, skill]) {
      const load = vi.fn(async () => result);

      expect(await localKitWarm({ ...options, records: [record, newer], load })).toBeUndefined();
      expect(load).toHaveBeenCalledExactlyOnceWith(newer.hash);
    }

    expect(
      await localKitWarm({
        ...options,
        records: [record],
        load: async () => {
          throw new Error('Unreadable artifact');
        },
      }),
    ).toBeUndefined();
  });

  it('refuses cancelled loading and never loads an absent source', async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => skill);

    expect(await localKitWarm({ ...options, records: [], load })).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    controller.abort();
    expect(await localKitWarm({ ...options, records: [record], load, signal: controller.signal })).toBeUndefined();
    expect(load).not.toHaveBeenCalled();

    const delayed = vi.fn(async () => {
      controller.abort();

      return skill;
    });
    const active = new AbortController();

    expect(
      await localKitWarm({
        ...options,
        records: [record],
        signal: active.signal,
        load: async () => {
          active.abort();

          return delayed();
        },
      }),
    ).toBeUndefined();
  });

  it('keeps the cold path when the selected runner cannot load a warm policy', async () => {
    const load = vi.fn(async () => skill);

    expect(await localKitWarm({ ...options, records: [record], load, available: async () => false })).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('refused local Motor Kit sources', () => {
  it('rejects source proof below the current Arena bar', async () => {
    const unproved = { ...skill, evidence: { ...skill.evidence!, arenaVersion: -1 } };
    const metadata = { ...record, hash: skillHash(unproved), evidence: unproved.evidence };

    expect(await localKitWarm({ ...options, records: [metadata], load: async () => unproved })).toBeUndefined();
  });

  it('does not dispatch a worker-prepared source after cancellation', async () => {
    const controller = new AbortController();
    const prepare = vi.fn(async () => {
      controller.abort();

      return { from: record.hash, policy: holdingPolicy(kitJob(model, 'stand', { minutes: 1, seed: 1 })) };
    });

    expect(
      await localKitWarm({
        ...options,
        records: [record],
        load: async () => skill,
        prepare,
        signal: controller.signal,
      }),
    ).toBeUndefined();
    expect(prepare).toHaveBeenCalledOnce();
  });

  it('refuses branching, missing chain depths and incompatible limbs before reading policies', () => {
    const schema = record.kitSource!;
    const branching = { ...schema, joints: schema.joints.map((joint) => ({ ...joint, limb: 0 })) };
    const skippedDepth = {
      ...schema,
      joints: schema.joints.map((joint) => ({ ...joint, depth: joint.depth === 2 ? 4 : joint.depth })),
    };

    expect(selectKitSource([{ ...record, kitSource: branching }], options)).toBeNull();
    expect(selectKitSource([{ ...record, kitSource: skippedDepth }], options)).toBeNull();
    expect(selectKitSource([record], { ...options, model: fixtureModel('biped-servo') })).toBeNull();
  });

  it('refuses invalid networks, clocks and cameras without guessing a policy conversion', async () => {
    if (skill.controller.kind !== 'policy') throw new Error('Expected policy fixture');

    const clock = extraObservations(skill.controller.policy, { clock: { frames: 30, loop: true } });
    const camera = extraObservations(skill.controller.policy, {
      eyes: [
        { part: 'camera', body: 'body', pos: [0, 0, 0], dirs: Array<number>(12).fill(0), cols: 2, rows: 2, rangeM: 3 },
      ],
    });

    expect(isRunnablePolicy(clock)).toBe(true);
    expect(isRunnablePolicy(camera)).toBe(true);

    const inferenceOnly = holdingPolicy(kitJob(model, 'stand', { minutes: 1, seed: 1 }));

    expect(isRunnablePolicy(inferenceOnly)).toBe(true);

    for (const policy of [{ ...skill.controller.policy, obsStd: [] }, inferenceOnly, clock, camera]) {
      const invalid = { ...skill, controller: { ...skill.controller, policy } };
      const metadata = { ...record, hash: skillHash(invalid as typeof skill) };

      expect(
        await localKitWarm({ ...options, records: [metadata], load: async () => invalid as typeof skill }),
      ).toBeUndefined();
    }
  });
});
