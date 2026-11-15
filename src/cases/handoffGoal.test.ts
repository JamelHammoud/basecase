import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { fixtureRobots, withoutGripper } from '../sim/fixtures/robots';
import { worldDeltas } from '../sim/mjcfFrames';
import { framePoses, type Recording } from '../sim/recorder';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, goalOf, goalValues } from './caseBuilder';
import { castRobot, castSlots, guestsOf } from './caseCast';
import { holdNear, near } from './caseGoals';
import { caseSlots, type Case, type ReferenceCommand } from './schema';
import { caseRobot, parseCase, runCase } from './testing';
import { scoreTry, trySignals, type TryScoring } from './tries';
import { replayTry } from './tryReplay';

const fixture = () => fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const builder = (r: FixtureRobot) => builderRobot(buildRig(r.joints, r.parts), r.parts);
const object = (kase: Case, id: string) => kase.world.objects.find((o) => o.id === id)!;

function handoff(a = fixture(), b = fixture(), values: { heightMm?: number } = {}): Case {
  const made = buildCase({ goal: 'handoff', world: 'floor', values }, { ...builder(a), partner: builder(b) });

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

function narrower(): FixtureRobot {
  const r = fixture();
  const moved = (at: V3): V3 => [at[0] - Math.sign(at[0]) * 3, at[1], at[2]];
  const finger = (id: string) => id.startsWith('finger_');

  return {
    ...r,
    id: 'arm-narrower',
    parts: r.parts.map((p) => (finger(p.id) ? { ...p, position: moved(p.position) } : p)),
    joints: r.joints.map((j) => (finger(j.id) ? { ...j, origin: moved(j.origin) } : j)),
  };
}

function sourceOf(result: Awaited<ReturnType<typeof runCase>>, a: FixtureRobot, b: FixtureRobot): TryScoring {
  const slots = caseSlots(result.case);
  const guests = guestsOf(slots, [caseRobot(b)]).map((g) => ({ ...g, robot: caseRobot(b) }));
  const team = castRobot(caseRobot(a), guests);
  const rig = buildRig(team.joints, team.parts);
  const cast = castSlots(slots, { rig, parts: team.parts, guests });

  return {
    kase: result.case,
    model: result.model,
    recording: result.recording!,
    rig,
    effector: cast[0].effector,
    effectors: Object.fromEntries(cast.map((c) => [c.id, c.effector])),
  };
}

function blockAt(source: TryScoring, recording: Recording, frame: number): number[] {
  const delta = worldDeltas(source.model, framePoses(recording, frame)).get('block') ?? new THREE.Matrix4();

  return new THREE.Vector3(...object(source.kase, 'block').position).applyMatrix4(delta).toArray();
}

function changedTimeline(kase: Case, change: (c: ReferenceCommand) => ReferenceCommand): Case {
  return { ...kase, reference: { timeline: kase.reference.timeline.map(change) } };
}

const closeAt = (kase: Case, slot: string) =>
  kase.reference.timeline.find((c) => c.slot === slot && c.aux?.[1] === 1)!.at;

const releaseAt = (kase: Case, slot: string) =>
  kase.reference.timeline.find((c) => c.slot === slot && c.at > closeAt(kase, slot) && c.aux?.[1] === 0)!.at;

function savedMarkerCase(): Case {
  const lead = {
    id: 'a',
    needs: ['arm'],
    minJoints: 2,
    binding: { endEffector: { part: 'link5', point: [0, 495, 0] } },
    reachMm: 445,
    anchor: [0, 50, 0],
  };
  const slots = [lead, { ...lead, id: 'b', anchor: [0, 50, 756], pose: { position: [0, 50, 756], yawDeg: 180 } }];
  const point: V3 = [0, 50, 378];
  const radius = 36;

  return parseCase({
    formatVersion: 1,
    id: 'hand-off-to-a-spot',
    name: 'Hand Off to a Spot',
    brief: 'Touch the point with one arm, then the other.',
    controls: [
      { id: 'move', label: 'Move', input: 'move' },
      { id: 'lift', label: 'Raise and Lower', input: 'lift' },
    ],
    slots,
    world: {
      objects: [
        {
          id: 'point',
          name: 'Point',
          kind: 'sphere',
          position: point,
          rotation: [0, 0, 0],
          size: [72, 72, 72],
          color: '#0d99ff',
          behavior: 'marker',
        },
      ],
    },
    reference: {
      timeline: [
        { at: 0.2, slot: 'a', target: point },
        { at: 3, slot: 'a', target: [0, 495, 0] },
        { at: 3, slot: 'b', target: point },
      ],
    },
    task: {
      seconds: 7,
      probes: ['a', 'b'].map((signal) => ({ signal, from: { effector: signal }, to: { object: 'point' } })),
      contract: {
        version: 1,
        success: {
          sequence: [
            holdNear('a', radius, 0.2),
            {
              hold_for: {
                seconds: 0.2,
                within: 'whole',
                state: { all: [near('b', radius), { not: near('a', radius) }] },
              },
            },
          ],
        },
        failures: [],
      },
    },
  });
}

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('physical Hand Off to a Spot', () => {
  it('builds a loose object, destination and evidence for both grippers', () => {
    const kase = handoff();
    const json = JSON.stringify(kase);

    expect(JSON.stringify(parseCase(JSON.parse(json)))).toBe(json);
    expect(object(kase, 'block').behavior).toBe('dynamic');
    expect(object(kase, 'block').massG).toBeGreaterThan(0);
    expect(object(kase, 'spot').behavior).toBe('marker');
    expect(caseSlots(kase).map((s) => s.needs)).toEqual([
      ['arm', 'gripper'],
      ['arm', 'gripper'],
    ]);
    expect(kase.controls.some((c) => c.input === 'grip')).toBe(true);
    expect(kase.task.probes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: 'donorGrip', kind: 'grip' }),
        expect.objectContaining({ signal: 'recipientGrip', kind: 'grip' }),
        expect.objectContaining({ signal: 'donorContact', kind: 'contact' }),
        expect.objectContaining({ signal: 'recipientContact', kind: 'contact' }),
      ]),
    );
  });

  it.each([
    { name: 'identical grippers', a: fixture(), b: fixture() },
    { name: 'a narrower donor', a: narrower(), b: fixture() },
    { name: 'a narrower recipient', a: fixture(), b: narrower() },
  ])('passes with $name using physical support from each hand', async ({ a, b }) => {
    const kase = handoff(a, b);
    const result = await runCase(mj, kase, a, { controller: 'reference', partners: [b] });
    const s = result.trace.signals;

    expect(result.refusal).toBeUndefined();
    expect(result.passed).toBe(true);
    expect(Math.max(...s.lift) - s.lift[0]).toBeGreaterThan(object(kase, 'block').size[1]);
    expect(s.donorGrip.some((v, i) => v > 0.5 && s.donorContact[i] > 0.5)).toBe(true);
    expect(s.recipientGrip.some((v, i) => v > 0.5 && s.recipientContact[i] > 0.5 && s.donorContact[i] < 0.5)).toBe(
      true,
    );
    expect(s.spot.at(-1)).toBeLessThan(object(kase, 'spot').size[0] / 2);
    expect(s.donorGrip.at(-1)).toBeLessThan(0.5);
    expect(s.recipientGrip.at(-1)).toBeLessThan(0.5);
  });

  it('passes at a different transfer height', async () => {
    const a = fixture();
    const values = goalValues(goalOf('handoff')!, { ...builder(a), partner: builder(a) });
    const kase = handoff(a, a, { heightMm: values.heightMm + 20 });
    const result = await runCase(mj, kase, a, { controller: 'reference', partners: [a] });

    expect(result.passed).toBe(true);
  });

  it.each(['limp', 'open', 'never releases', 'releases early', 'drops before placement'])(
    'fails when the recipient or donor %s',
    async (fault) => {
      const a = fixture();
      const kase = handoff();
      const recipientClose = closeAt(kase, 'b');
      const donorRelease = releaseAt(kase, 'a');
      const earlyDrop = (donorRelease + releaseAt(kase, 'b')) / 2;
      const broken = changedTimeline(kase, (c) => {
        if (fault === 'open' && c.slot === 'b') return { ...c, aux: [0, 0] };

        if (fault === 'never releases' && c.slot === 'a' && c.at >= donorRelease) return { ...c, aux: [0, 1] };

        if (fault === 'releases early' && c.slot === 'a' && c.at === donorRelease)
          return { ...c, at: recipientClose - 0.5 };

        if (fault === 'drops before placement' && c.slot === 'b' && c.at === releaseAt(kase, 'b'))
          return { ...c, at: earlyDrop };

        if (fault === 'drops before placement' && c.slot === 'b' && c.at > earlyDrop) return { ...c, aux: [0, 0] };

        return c;
      });
      const result = await runCase(mj, broken, a, {
        controller: 'reference',
        partners: [a],
        ...(fault === 'limp' ? { limp: ['b'] } : {}),
      });

      expect(result.passed).toBe(false);
    },
  );

  it('replays the recorded object trajectory and scores the same physical evidence', async () => {
    const a = fixture();
    const result = await runCase(mj, handoff(), a, { controller: 'reference', partners: [a], record: true });
    const source = sourceOf(result, a, a);
    const scored = await scoreTry(source);
    const replayed = await replayTry(mj, source, null);
    const signals = trySignals(source).signals;

    expect(result.passed).toBe(true);
    expect(scored.passed).toBe(result.passed);
    expect(replayed.passed).toBe(scored.passed);
    expect(signals.recipientContact.some((v) => v > 0.5)).toBe(true);
    expect(
      (
        await scoreTry({
          ...source,
          recording: { ...source.recording, contacts: undefined, contactOffsets: undefined },
        })
      ).passed,
    ).toBe(false);
    expect(replayed.recording.frames).toBe(source.recording.frames);

    for (let frame = 0; frame < source.recording.frames; frame += 10) {
      const original = blockAt(source, source.recording, frame);
      const replay = blockAt(source, replayed.recording, frame);

      original.forEach((value, i) => expect(replay[i]).toBeCloseTo(value, 2));
    }
  });
});

describe('handoff loads and compatibility', () => {
  it.each([
    { massG: 20, effort: 5, passed: true },
    { massG: 150, effort: 5, passed: false },
    { massG: 20, effort: 0.05, passed: false },
  ])('a $massG g load with $effort N recipient jaws has verdict $passed', async ({ massG, effort, passed }) => {
    const a = fixture();
    const b = {
      ...fixture(),
      joints: fixture().joints.map((j) => ({ ...j, effortNm: j.id.startsWith('finger_') ? effort : j.effortNm })),
    };
    const made = handoff(a, b);
    const kase = {
      ...made,
      world: { objects: made.world.objects.map((o) => (o.id === 'block' ? { ...o, massG } : o)) },
    };
    const result = await runCase(mj, kase, a, { controller: 'reference', partners: [b] });

    expect(result.refusal).toBeUndefined();
    expect(result.passed).toBe(passed);
  });

  it('refuses jaws whose travel cannot close on the block', () => {
    const a = fixture();
    const b = {
      ...fixture(),
      joints: fixture().joints.map((j) => {
        if (j.id === 'finger_left') return { ...j, range: [0, 1] as [number, number] };

        if (j.id === 'finger_right') return { ...j, range: [-1, 0] as [number, number] };

        return j;
      }),
    };

    expect(buildCase({ goal: 'handoff', world: 'floor' }, { ...builder(a), partner: builder(b) }).ok).toBe(false);
  });

  it('refuses an arm without a gripper and an unreachable transfer', () => {
    const a = fixture();
    const ungripped = withoutGripper(a);

    expect(buildCase({ goal: 'handoff', world: 'floor' }, { ...builder(a), partner: builder(ungripped) }).ok).toBe(
      false,
    );
    expect(
      buildCase(
        { goal: 'handoff', world: 'floor', values: { distanceMm: 5000 } },
        { ...builder(a), partner: builder(a) },
      ).ok,
    ).toBe(false);
  });

  it('keeps saved marker-only handoffs unchanged and playable', async () => {
    const saved = savedMarkerCase();
    const json = JSON.stringify(saved);
    const arm = withoutGripper(fixture());
    const result = await runCase(mj, parseCase(JSON.parse(json)), arm, { controller: 'reference', partners: [arm] });

    expect(JSON.stringify(parseCase(JSON.parse(json)))).toBe(json);
    expect(saved.task.probes.every((p) => !('kind' in p))).toBe(true);
    expect(result.refusal).toBeUndefined();
    expect(result.passed).toBe(true);
  });
});
