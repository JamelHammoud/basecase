import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { G1_JOINT_NAMES } from '../../../electron/robot/unitreeG1.mjs';
import { readStoredTry } from '../../cases/tryFile';
import type { SimModel } from '../../sim/mjcfTypes';
import { episodeOf, namedArm, sceneModel, SO101_JOINTS, sourceOf, sweepDeg } from './fixtures';
import { sourceSpans } from './dataImportJobs';
import { importedTries, type ImportTarget } from './importedTries';
import { importStep, matchInput, robotTypePreset } from './importPlan';
import type { JointPairs } from './jointMatch';
import type { SourceData } from './types';
import { detectUnit } from './units';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const target: ImportTarget = {
  sceneId: 'scene-1',
  modelHash: 'hash',
  origin: { kind: 'hub', repo: 'lerobot/so101_pick', revision: 'a'.repeat(40) },
  startedAt: '2026-11-14T00:00:00.000Z',
};

const D2R = Math.PI / 180;

function readyPlan(data: SourceData, model: SimModel, remembered: JointPairs | null = null) {
  const step = importStep({
    input: matchInput({ names: data.names, spans: sourceSpans(data) }, model),
    model,
    robotType: data.robotType,
    remembered,
  });

  if (step.kind !== 'ready') throw new Error(`expected a ready plan, got ${step.kind}`);

  return step.plan;
}

const build = (data: SourceData, model: SimModel, remembered: JointPairs | null = null) =>
  importedTries(mj, { model, data, plan: readyPlan(data, model, remembered), target });

function qposOf(model: SimModel, built: Awaited<ReturnType<typeof build>>, jointId: string, frame = 0) {
  const { recording } = built.kept[0];
  const at = recording.jointQpos![model.joints.findIndex((j) => j.id === jointId)];

  return recording.qpos[frame * recording.nq + at];
}

describe('detecting units by range', () => {
  const span = (lo: number, hi: number) => [{ lo, hi }];

  it('reads radians, degrees and Feetech counts', () => {
    expect(detectUnit(span(-3.1, 3.1))).toBe('rad');
    expect(detectUnit(span(-120, 95))).toBe('deg');
    expect(detectUnit(span(900, 3100))).toBe('counts');
    expect(detectUnit(span(-5000, 5000))).toBeNull();
  });
});

describe('importing episodes as tries', () => {
  it('replays an SO-101 dataset in degrees on the scene’s SO-101, joint by joint', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const names = SO101_JOINTS.map((n) => `${n}.pos`);
    const data = sourceOf(names, [episodeOf({ names, frames: 40, task: 'Pick the cube', value: sweepDeg })]);
    const built = await build(data, model);
    const stored = built.kept[0].stored;

    expect(built.refused).toBe(0);
    expect(qposOf(model, built, 'elbow_flex', 7)).toBeCloseTo(sweepDeg(7, 2) * D2R, 6);
    expect(stored).toMatchObject({ source: 'import', task: 'Pick the cube', origin: target.origin, videos: [] });
    expect(stored.case).toBeNull();
    expect(readStoredTry(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(built.kept[0].recording.frames).toBe(40);
    expect(built.kept[0].recording.dt).toBeCloseTo(1 / 30, 9);
  });

  it('moves the robot’s bodies with its joints', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const data = sourceOf(SO101_JOINTS, [episodeOf({ names: SO101_JOINTS, frames: 20, value: sweepDeg })]);
    const { recording } = (await build(data, model)).kept[0];
    const size = recording.nbody * 7;
    const first = recording.poses.subarray(0, size);
    const later = recording.poses.subarray(15 * size, 16 * size);

    expect(first.some((v, i) => Math.abs(v - later[i]) > 1e-3)).toBe(true);
  });

  it('reads raw Feetech counts', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const counts = (n: number, c: number) => 2048 + (sweepDeg(n, c) * 4096) / 360;
    const data = sourceOf(SO101_JOINTS, [episodeOf({ names: SO101_JOINTS, frames: 10, value: counts })]);
    const built = await build(data, model);

    expect(qposOf(model, built, 'shoulder_lift', 3)).toBeCloseTo(sweepDeg(3, 1) * D2R, 6);
  });
});

describe('matching joints', () => {
  it('matches a Koch dataset’s prefixed names', () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const names = SO101_JOINTS.map((n) => `main_${n}`);
    const plan = readyPlan(sourceOf(names, [episodeOf({ names, frames: 5, value: sweepDeg })]), model);

    expect(plan.joints).toEqual(SO101_JOINTS);
  });

  it('puts ALOHA-style bimanual data on two arms by side', () => {
    const arm = ['waist', 'shoulder', 'elbow', 'forearm_roll', 'wrist_angle', 'wrist_rotate', 'gripper'];
    const model = sceneModel([namedArm(arm), namedArm(arm, { prefix: 'second_', x: 400 })]);
    const names = [...arm.map((n) => `left_${n}`), ...arm.map((n) => `right_${n}`)];
    const radians = (n: number, c: number) => sweepDeg(n, c) * D2R;
    const plan = readyPlan(sourceOf(names, [episodeOf({ names, frames: 5, value: radians })]), model);
    const onRobot = (k: number) =>
      arm.map((n) => model.robots[k].joints.find((id) => id === n || id === `second_${n}`));

    expect(plan.unit).toBe('rad');
    expect(plan.joints).toEqual([...onRobot(0), ...onRobot(1)]);
    expect(new Set(plan.joints).size).toBe(14);
  });

  it('puts ALOHA-style data on a Case’s two slots by their prefix', () => {
    const arm = ['waist', 'shoulder', 'elbow'];
    const model = sceneModel([namedArm(arm), namedArm(arm, { prefix: 'b.', x: 400 })]);
    const oneRobot = { ...model, joints: model.joints.map((j) => ({ ...j, robot: model.robots[0].key })) };
    const names = [...arm.map((n) => `left_${n}`), ...arm.map((n) => `right_${n}`)];
    const data = sourceOf(names, [episodeOf({ names, frames: 5, value: (n, c) => sweepDeg(n, c) * D2R })]);

    expect(readyPlan(data, oneRobot).joints).toEqual([...arm, ...arm.map((n) => `b.${n}`)]);
  });

  it('puts a G1 arms dataset on the G1’s arm joints and leaves its legs at rest', async () => {
    const model = sceneModel([namedArm([...G1_JOINT_NAMES])]);
    const arms = G1_JOINT_NAMES.filter((n) => /shoulder|elbow|wrist/.test(n));
    const names = arms.map((n) =>
      n.replace(/_joint$/, '').replace(/(^|_)([a-z])/g, (_m: string, _s: string, c: string) => c.toUpperCase()),
    );
    const data = sourceOf(
      names.map((n) => `k${n}`),
      [episodeOf({ names, frames: 6, value: (n, c) => sweepDeg(n, c) * D2R })],
    );
    const plan = readyPlan(data, model);

    expect(arms).toHaveLength(14);
    expect(plan.joints).toEqual(arms);

    const built = await importedTries(mj, { model, data, plan, target });

    expect(qposOf(model, built, 'left_knee_joint', 5)).toBe(0);
    expect(qposOf(model, built, 'right_elbow_joint', 5)).toBeCloseTo(sweepDeg(5, 10) * D2R, 6);
  });

  it('asks for a hand match when names differ, prefilled by order and range, and remembers it', async () => {
    const model = sceneModel([namedArm(['a0', 'a1', 'a2'], { range: [-90, 90] })]);
    const names = ['motor_1', 'motor_2', 'motor_3'];
    const data = sourceOf(names, [episodeOf({ names, frames: 8, value: (n, c) => (c === 0 ? 120 : sweepDeg(n, c)) })]);
    const input = matchInput({ names: data.names, spans: sourceSpans(data) }, model);
    const step = importStep({ input, model, robotType: null, remembered: null });

    expect(step.kind).toBe('match');
    expect(step.kind === 'match' && step.joints).toEqual([null, 'a0', 'a1']);

    const chosen: JointPairs = ['a2', 'a0', 'a1'];

    expect(importStep({ input, model, robotType: null, remembered: chosen })).toMatchObject({
      kind: 'ready',
      plan: { joints: chosen },
    });
    expect(importStep({ input, model, robotType: null, remembered: ['gone', 'a0', 'a1'] }).kind).toBe('match');
  });
});

describe('importing the same data and refusing what doesn’t fit', () => {
  it('gives the same ids to the same episodes, so importing again adds nothing', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const episodes = [0, 1, 2].map((k) =>
      episodeOf({ names: SO101_JOINTS, frames: 12, value: (n, c) => sweepDeg(n + k * 5, c) }, k),
    );
    const data = sourceOf(SO101_JOINTS, episodes);
    const first = (await build(data, model)).kept.map((k) => k.stored.id);
    const again = (await build(data, model)).kept.map((k) => k.stored.id);

    expect(new Set(first).size).toBe(3);
    expect(again).toEqual(first);
    expect(first.every((id) => /^import-[0-9a-f]{32}$/.test(id))).toBe(true);
  });

  it('refuses an episode out of range on every frame and keeps one that leaves it for a while', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const out = episodeOf({ names: SO101_JOINTS, frames: 10, value: () => 175 }, 0);
    const partly = episodeOf({ names: SO101_JOINTS, frames: 10, value: (n) => (n < 3 ? 175 : 20) }, 1);
    const data = sourceOf(SO101_JOINTS, [out, partly]);
    const built = await importedTries(mj, {
      model,
      data,
      plan: {
        joints: SO101_JOINTS,
        unit: 'deg',
        spans: matchInput({ names: data.names, spans: sourceSpans(data) }, model).spans,
      },
      target,
    });

    expect(built.refused).toBe(1);
    expect(built.kept).toHaveLength(1);
    expect(built.kept[0].stored.outOfRange).toBe(3);
  });

  it('offers the dataset’s robot when the scene has none of its joints', () => {
    const model = sceneModel([namedArm(['a0', 'a1'])]);
    const data = sourceOf(
      SO101_JOINTS,
      [episodeOf({ names: SO101_JOINTS, frames: 4, value: sweepDeg })],
      'so101_follower',
    );
    const step = importStep({
      input: matchInput({ names: data.names, spans: sourceSpans(data) }, model),
      model,
      robotType: data.robotType,
      remembered: null,
    });

    expect(step).toMatchObject({ kind: 'no-robot', preset: { id: 'so101' } });
    expect(robotTypePreset('unitree_g1')?.id).toBe('unitree-g1');
    expect(robotTypePreset('koch')).toBeNull();
  });
});
