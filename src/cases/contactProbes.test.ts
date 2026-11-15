import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { SimModel } from '../sim/mjcfTypes';
import { frameContacts, framePoses } from '../sim/recorder';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { probeReader, type ProbeWorld } from './probes';
import { decodeRecording, encodeRecording } from './recordingFile';
import { parseCase } from './schema';
import { scaledToReach } from './scale';
import { runCase } from './testing';
import { robotFacts } from './robotFit';
import { replayTry } from './tryReplay';
import { caseProbeReader, scoreTry, trySignals } from './tries';
import { liveGoal } from './liveGoal';
import { traceJudge } from './goalJudge';
import { sampleRecording } from '../datasets/snapshotRecording';
import { stageCase, stagedEffectors } from './caseCast';
import { rigForWorker } from '../sim/drive';

const robot = () => fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const pickCase = () => {
  const arm = robot();
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
};
const evidence = (kind: 'grip' | 'contact') => ({
  signal: kind,
  kind,
  from: { effector: 'robot' },
  to: { object: 'block' },
});

const world = (): ProbeWorld => ({
  model: {
    bodies: [
      { name: 'palm', parts: ['palm'], robot: 'arm', origin: [0, 0, 0] },
      { name: 'left', parts: [], joint: 'left', robot: 'arm', origin: [0, 0, 0] },
      { name: 'right', parts: [], joint: 'right', robot: 'arm', origin: [0, 0, 0] },
      { name: 'block', parts: [], world: ['block'], origin: [0, 0, 0] },
      { name: 'guest', parts: [], robot: 'guest', origin: [0, 0, 0] },
    ],
  } as SimModel,
  effector: { part: 'palm', point: [0, 0, 0] },
  effectors: { robot: { part: 'palm', point: [0, 0, 0] } },
  grippers: { robot: ['left', 'right'] },
  basePart: null,
  basePoint: [0, 0, 0],
  objectAt: new Map([['block', [0, 0, 0]]]),
});

it('requires actual contact and both jaws on the same object for a grip', () => {
  const reader = probeReader([evidence('contact'), evidence('grip')], world());
  const out: Record<string, number[]> = {};
  const poses = new Float64Array(35);

  for (const contacts of [undefined, [4, 3], [0, 3], [1, 3], [3, 1, 2, 3], []]) {
    reader.sample(poses, out, contacts);
  }

  expect(out.contact).toEqual([0, 0, 1, 1, 1, 0]);
  expect(out.grip).toEqual([0, 0, 0, 0, 1, 0]);
});

describe('recorded contact evidence', () => {
  it('scores a live kept handoff with the staged guest rig and both jaw pairs', async () => {
    const mj = await loadMujoco();
    const arm = robot();
    const scene = { rig: buildRig(arm.joints, arm.parts), parts: arm.parts };
    const builder = builderRobot(scene.rig, scene.parts);
    const built = buildCase({ goal: 'handoff', world: 'floor' }, { ...builder, partner: builder });

    if (!built.ok) throw new Error(built.problem);

    const result = await runCase(mj, built.kase, arm, { controller: 'reference', partners: [arm], record: true });
    const staged = stageCase(result.case, scene, [arm]);
    const leadContext = { rig: scene.rig };
    const source = {
      kase: staged.kase,
      model: result.model,
      recording: result.recording!,
      ...leadContext,
      ...stagedEffectors(staged, scene),
    };

    expect(result.passed).toBe(true);
    expect(trySignals(source).signals.recipientGrip.some((value) => value === 1)).toBe(true);
    expect((await scoreTry(source)).passed).toBe(true);
    expect((await scoreTry({ ...source, rig: rigForWorker(source.rig) })).passed).toBe(true);
  });

  it('keeps unitless thresholds when reach changes and refuses malformed probe kinds', () => {
    const kase = pickCase();

    kase.task.probes.push(evidence('grip'));
    kase.task.contract.success = {
      eventually: { window: 'whole', state: { atom: { expr: { signal: 'grip' }, cmp: '>', value: 0.5, scale: 1 } } },
    };

    const scaled = scaledToReach(kase, kase.slot!.reachMm! / 2, kase.slot!.anchor!);

    expect(scaled.task.contract.success).toEqual(kase.task.contract.success);
    expect(() =>
      parseCase({ ...kase, task: { ...kase.task, probes: [{ ...evidence('grip'), kind: 'near' }] } }),
    ).toThrow();
    expect(() =>
      parseCase({ ...kase, task: { ...kase.task, probes: [{ ...evidence('grip'), from: 'base' }] } }),
    ).toThrow();
  });

  it('records MuJoCo jaw contacts, round-trips them and reproduces the grip signals', async () => {
    const mj = await loadMujoco();
    const arm = robot();
    const kase = pickCase();
    const block = kase.world.objects.find((o) => o.behavior === 'dynamic')!;

    kase.task.probes.push({ ...evidence('grip'), to: { object: block.id } });

    const result = await runCase(mj, kase, arm, { controller: 'reference', record: true });
    const rig = buildRig(arm.joints, arm.parts);
    const source = {
      kase: result.case,
      model: result.model,
      recording: result.recording!,
      rig,
      effector: robotFacts(rig, arm.parts).endEffector,
    };
    const trace = trySignals(source);
    const recording = decodeRecording(encodeRecording(source.recording))!;

    expect(recording.contactOffsets).toHaveLength(recording.frames + 1);
    expect(trace.signals.grip.some((n) => n === 1)).toBe(true);
    expect(recording.contacts).toEqual(source.recording.contacts);
    expect(trace.signals.grip.slice(0, result.trace.signals.grip.length)).toEqual(result.trace.signals.grip);
    expect(trySignals({ ...source, rig: buildRig(arm.joints, arm.parts), recording })).toEqual(trace);
    expect(Array.from({ length: recording.frames }, (_, i) => frameContacts(recording, i).length).some(Boolean)).toBe(
      true,
    );
    expect(
      trySignals({
        ...source,
        recording: { ...recording, contacts: undefined, contactOffsets: undefined },
      }).signals.grip.every((n) => n === 0),
    ).toBe(true);

    const replayed = await replayTry(mj, { ...source, recording }, null);

    expect(replayed.passed).toBe(result.passed);
    expect(trySignals({ ...source, recording: replayed.recording }).signals.grip).toEqual(trace.signals.grip);

    const goal = liveGoal(caseProbeReader(source), traceJudge(source.kase.task.contract));

    for (let i = 0; i < recording.frames; i++) {
      goal.add(i * recording.dt, framePoses(recording, i), frameContacts(recording, i));
    }

    expect(await goal.judge()).toEqual(await scoreTry(source));

    const slice = sampleRecording(recording, { from: 10, to: recording.frames - 10 });

    expect(decodeRecording(encodeRecording(slice))).toEqual(slice);
    expect(Array.from(frameContacts(slice, 0))).toEqual(Array.from(frameContacts(recording, 10)));

    for (const broken of [
      { contacts: Int32Array.of(0, recording.nbody), contactOffsets: recording.contactOffsets },
      { contacts: recording.contacts, contactOffsets: Int32Array.of(0) },
      { contacts: recording.contacts, contactOffsets: undefined },
    ]) {
      expect(decodeRecording(encodeRecording({ ...recording, ...broken }))).toBeNull();
    }
  });
});
