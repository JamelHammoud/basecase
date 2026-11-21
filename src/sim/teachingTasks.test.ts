import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { Buffer } from 'node:buffer';
import { beforeAll, expect, it } from 'vitest';
import { caseRunner, type CaseResult } from '../cases/runCase';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { scoreTry } from '../cases/tries';
import { hashOf } from '../skills/hash';
import type { Recording } from './recorder';
import { Recorder } from './recorder';
import { SimEngine } from './engine';
import { driveAccess } from './driveAccess';
import { teachingTask, TEACHING_TASKS } from './fixtures/teachingTasks';
import { teachingPolicy } from './fixtures/teachingPolicy';
import type { ActionOwner } from './teaching';
import type { ArmSetup } from './drive';
import type { PolicySpec } from './policy';

let mj: MainModule;
const references = new Map<number, Promise<CaseResult>>();

beforeAll(async () => {
  mj = await loadMujoco();
});

function referenceFor(index: number) {
  const cached = references.get(index);

  if (cached) return cached;

  const { robot, kase } = teachingTask(index);
  const reference = caseRunner(mj, kase, robot, { controller: 'reference', record: true }).run();

  references.set(index, reference);

  return reference;
}

function state(engine: SimEngine) {
  const { data } = engine;

  return [data.time, ...data.qpos, ...data.qvel, ...data.act, ...data.history, ...data.qacc_warmstart, ...data.ctrl];
}

function handoff(engine: SimEngine, owner: ActionOwner) {
  const before = state(engine);

  engine.handoff(owner);
  engine.handoff(owner);
  expect(state(engine)).toEqual(before);
}

function referenceCommand(engine: SimEngine, reference: Recording, frame: number) {
  return {
    v: [0, 0, 0] as [number, number, number],
    joints: Object.fromEntries(
      engine.sim.joints
        .filter((joint) => joint.actuator >= 0)
        .map((joint) => [
          joint.id,
          reference.ctrl[(frame + 1) * reference.nu + joint.actuator] /
            (joint.type === 'prismatic' ? 0.001 : Math.PI / 180),
        ]),
    ),
  };
}

function stationaryPolicy(policy: PolicySpec): PolicySpec {
  const width = policy.obsMean.length;
  const count = policy.joints.length;

  return {
    ...policy,
    layers: [{ in: width, out: count, w: Array<number>(width * count).fill(0), b: Array<number>(count).fill(0) }],
  };
}

function correctionFault(engine: SimEngine, recorder: Recorder, frame: number, joint: string) {
  if (frame !== 3 && frame !== 6) return;

  const kind = frame === 3 ? 'weak' : null;

  engine.setFault(joint, kind);
  recorder.fault(joint, kind);
}

function replayCorrections(engine: SimEngine, reference: Recording, setup: ArmSetup, policy: PolicySpec) {
  const controller = { kind: 'policy' as const, robot: setup.robot, policy };

  engine.setController(controller);
  engine.startTeaching(setup);

  const recorder = new Recorder(engine, controller);
  const fault = policy.joints[0];
  let resumed = false;
  let contactAt: number | null = null;
  let resumeAt = reference.t.at(-1)! / 2;

  engine.stepHook = recorder.hook;
  engine.controlHook = recorder.control;
  engine.commandHook = recorder.command;

  for (let frame = 0; frame < reference.frames - 1; frame++) {
    const time = frame * reference.dt;

    if (frame === 2) handoff(engine, 'operator');

    correctionFault(engine, recorder, frame, fault);

    if (!resumed && time > 1 && engine.contactPairs().some((body) => !!engine.sim.bodies[body].robot)) {
      contactAt = time;
      resumeAt = time;
      resumed = true;
      handoff(engine, 'policy');
    }

    if (!resumed && time >= resumeAt) {
      resumed = true;
      handoff(engine, 'policy');
    }

    if (
      resumed &&
      engine.teachingSource()?.owner === 'policy' &&
      time >= resumeAt + 0.04 &&
      frame < reference.frames - 3
    )
      handoff(engine, 'operator');

    if (frame === reference.frames - 3) handoff(engine, 'policy');

    engine.command(referenceCommand(engine, reference, frame));
    engine.step(reference.dt);
  }

  return { recording: recorder.finish(), contactAt, policy };
}

it.each(TEACHING_TASKS.map((name, index) => [name, index] as const))(
  'accepts the reference and rejects an independent stationary policy for %s',
  async (_name, index) => {
    const { robot, kase } = teachingTask(index);
    const reference = await referenceFor(index);
    const policy = stationaryPolicy(teachingPolicy(reference.model));
    const negative = await caseRunner(mj, kase, robot, { controller: 'policy', policy }).run();

    expect(reference.passed).toBe(true);
    expect(negative.passed).toBe(false);
  },
);

it.each(TEACHING_TASKS.map((name, index) => [name, index] as const))(
  'keeps continuous ownership and complete-try judgment for %s',
  async (_name, index) => {
    const { robot, kase, rig } = teachingTask(index);
    const reference = await referenceFor(index);

    expect(reference.passed).toBe(true);

    const model = {
      ...reference.model,
      xml:
        index % 2
          ? reference.model.xml.replaceAll('<position name=', '<position delay="0.006" nsample="5" name=')
          : reference.model.xml,
    };
    const policy = teachingPolicy(model);
    const sourceHash = hashOf(policy);
    const access = driveAccess({ rig, parts: robot.parts, model });

    if (access.kind !== 'ready' || access.setup.kind !== 'arm') throw new Error('Expected fixed arm');

    const engine = new SimEngine(mj, model);

    try {
      const taught = replayCorrections(engine, reference.recording!, access.setup, policy);
      const recording = decodeRecording(encodeRecording(taught.recording))!;
      const scoring = {
        kase: reference.case,
        model,
        recording,
        rig,
        effector: { part: access.setup.part, point: access.setup.point },
      };
      const verdict = await scoreTry(scoring);
      const ordinary = { ...recording, teaching: undefined };

      expect(await scoreTry({ ...scoring, recording: ordinary })).toEqual(verdict);
      expect(hashOf(policy)).toBe(sourceHash);
      expect(engine.data.time).toBeCloseTo(kase.task.seconds, 7);
      expect(recording.t.at(-1)).toBeCloseTo(kase.task.seconds, 5);
      expect(recording.teaching?.boundaries).toBe(Math.round(kase.task.seconds / engine.dt));
      expect(recording.actionTime?.every((at, i, times) => !i || at > times[i - 1])).toBe(true);
      expect(recording.actionOwner?.every((owner) => owner === 0 || owner === 1)).toBe(true);
      expect(recording.teaching?.ownership?.map((interval) => interval.owner)).toEqual([
        'policy',
        'operator',
        'policy',
        'operator',
        'policy',
      ]);
      expect(recording.faults).toMatchObject([
        { joint: policy.joints[0], kind: 'weak', at: expect.closeTo(0.06, 8), until: expect.closeTo(0.12, 8) },
      ]);
      expect(recording.contactOffsets).toHaveLength(recording.frames + 1);
      expect(Buffer.from(recording.qpos.buffer).equals(Buffer.from(taught.recording.qpos.buffer))).toBe(true);

      if (index % 2) expect(engine.model.nhistory).toBeGreaterThan(0);

      if (index !== 8) expect(taught.contactAt).not.toBeNull();
    } finally {
      engine.dispose();
    }
  },
);

it('keeps a deadline missed before takeover failed even when the later correction reaches the target', async () => {
  const { robot, kase, rig } = teachingTask(8);
  const reference = await referenceFor(8);
  const model = reference.model;
  const access = driveAccess({ rig, parts: robot.parts, model });

  if (access.kind !== 'ready' || access.setup.kind !== 'arm') throw new Error('Expected fixed arm');

  const engine = new SimEngine(mj, model);
  const policy = teachingPolicy(model);
  const controller = { kind: 'policy' as const, robot: access.setup.robot, policy };

  try {
    engine.setController(controller);
    engine.startTeaching(access.setup);

    const recorder = new Recorder(engine, controller);

    engine.stepHook = recorder.hook;
    engine.controlHook = recorder.control;
    engine.step(1);
    handoff(engine, 'operator');

    for (let frame = 50; frame < reference.recording!.frames - 1; frame++) {
      engine.command(referenceCommand(engine, reference.recording!, frame));
      engine.step(reference.recording!.dt);
    }

    const recording = recorder.finish();
    const missed = structuredClone(kase);

    missed.task.contract.success = {
      eventually: {
        window: { from: 0, to: 0.5 },
        state: { atom: { expr: { signal: 'front' }, cmp: '<', value: 15, scale: 15 } },
      },
    };

    const scoring = { model, recording, rig, effector: { part: access.setup.part, point: access.setup.point } };

    expect((await scoreTry({ ...scoring, kase })).passed).toBe(true);
    expect((await scoreTry({ ...scoring, kase: missed })).passed).toBe(false);
    expect(recording.teaching?.ownership).toMatchObject([
      { owner: 'policy', until: expect.closeTo(1, 8) },
      { owner: 'operator', at: expect.closeTo(1, 8) },
    ]);
    expect(recording.t.at(-1)).toBeCloseTo(kase.task.seconds, 6);
  } finally {
    engine.dispose();
  }
});
