import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { worldDeltas } from '../sim/mjcfFrames';
import { framePoses, type Recording } from '../sim/recorder';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { referenceTry, touchTheDots } from './testing';
import { generatedFrom, generatedTry, multipliable, type TryScoring } from './tries';
import { multiplyTry, replayTry, shiftedCommands, worldOffsets } from './tryReplay';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

let mj: MainModule;
let touch: Awaited<ReturnType<typeof referenceTry>>;

beforeAll(async () => {
  mj = await loadMujoco();
  touch = await referenceTry(mj, touchTheDots(fixture('arm-3dof')), fixture('arm-3dof'));
}, 60000);

function qposGap(a: Recording, b: Recording) {
  let gap = 0;

  for (let i = 0; i < Math.min(a.qpos.length, b.qpos.length); i++) gap = Math.max(gap, Math.abs(a.qpos[i] - b.qpos[i]));

  return gap;
}

function objectAt(source: TryScoring, recording: Recording, id: string, frame: number): V3 {
  const rest = source.kase.world.objects.find((o) => o.id === id)!.position;
  const delta = worldDeltas(source.model, framePoses(recording, frame)).get(id) ?? new THREE.Matrix4();

  return new THREE.Vector3(...rest).applyMatrix4(delta).toArray();
}

const nearestDot = (source: TryScoring, target: V3) =>
  source.kase.world.objects
    .filter((o) => o.behavior === 'marker')
    .reduce((best, o) =>
      new THREE.Vector3(...o.position).distanceTo(new THREE.Vector3(...target)) <
      new THREE.Vector3(...best.position).distanceTo(new THREE.Vector3(...target))
        ? o
        : best,
    );

describe('a driven try', () => {
  it('records the commands it was driven with and the controller that drove it', () => {
    const { recording } = touch.source;

    expect(touch.verdict.passed).toBe(true);
    expect(recording.controller?.kind).toBe('drive');
    expect(recording.commands?.map((c) => c.command.target)).toEqual(
      touch.source.kase.reference.timeline.map((c) => c.target),
    );
    expect(touch.record.commands).toBe(recording.commands?.length);
    expect(multipliable(touch.record)).toBe(true);
  });

  it('replays with no jitter to the same pass, joint for joint', async () => {
    const replayed = await replayTry(mj, touch.source, null);

    expect(replayed.passed).toBe(true);
    expect(replayed.recording.frames).toBe(touch.source.recording.frames);
    expect(qposGap(replayed.recording, touch.source.recording)).toBeLessThan(1e-3);
  });
});

describe('Multiply', () => {
  it('moves each arm target by the offset of the dot it was nearest', () => {
    const offsets = worldOffsets(touch.source.kase, 3);
    const shifted = shiftedCommands(touch.source, offsets);
    const commands = touch.source.recording.commands!;

    expect(offsets.size).toBe(3);
    commands.forEach((c, i) => {
      const target = c.command.target!;
      const moved = shifted[i].command.target!;
      const offset = offsets.get(nearestDot(touch.source, target).id)!;

      moved.forEach((x, k) => expect(x - target[k]).toBeCloseTo(offset[k], 6));
    });
  });

  it('keeps 20 or more of 50 variations of one driven Touch the Dots try, all passing', async () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
    const { tried, kept } = await multiplyTry(mj, touch.source, seeds);

    expect(tried).toBe(50);
    expect(kept.length).toBeGreaterThanOrEqual(20);
    expect(kept.every((v) => v.passed)).toBe(true);
    expect(new Set(kept.map((v) => v.seed)).size).toBe(kept.length);
  }, 240000);

  it('drops variations that fail', async () => {
    const recording = { ...touch.source.recording, commands: touch.source.recording.commands!.slice(0, 1) };
    const { tried, kept } = await multiplyTry(mj, { ...touch.source, recording }, [1, 2, 3]);

    expect(tried).toBe(3);
    expect(kept).toEqual([]);
  });

  it('starts a loose block where the jitter put it, and moves the grip with it', async () => {
    const arm = fixture('arm-6dof');
    const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

    if (!built.ok) throw new Error(built.problem);

    const pick = await referenceTry(mj, built.kase, arm);
    const offsets = worldOffsets(pick.source.kase, 5);
    const block = offsets.get('block')!;
    const variation = await replayTry(mj, pick.source, 5);
    const before = objectAt(pick.source, pick.source.recording, 'block', 0);
    const after = objectAt(pick.source, variation.recording, 'block', 0);
    const grip = pick.source.recording.commands!.findIndex((c) => c.command.aux?.[1] === 1);
    const shifted = shiftedCommands(pick.source, offsets)[grip].command.target!;

    after.forEach((x, k) => expect(x - before[k]).toBeCloseTo(block[k], 3));
    shifted.forEach((x, k) =>
      expect(x - pick.source.recording.commands![grip].command.target![k]).toBeCloseTo(block[k], 6),
    );
  }, 120000);
});

describe('generated tries', () => {
  it('carry their seed and source try, and are never multiplied again', async () => {
    const replayed = await replayTry(mj, touch.source, 7);
    const generated = generatedTry({
      source: touch.record,
      seed: 7,
      margin: replayed.margin,
      recording: replayed.recording,
    });

    expect(generated).toMatchObject({
      id: `${touch.record.id}-7`,
      source: 'generated',
      outcome: { result: 'passed' },
      case: touch.record.case,
      seed: 7,
      sourceTry: touch.record.id,
    });
    expect(generated.robot.modelHash).toBe(touch.record.robot.modelHash);
    expect(multipliable(generated)).toBe(false);
    expect(generatedFrom([touch.record, generated], touch.record)).toEqual([generated]);
  });
});
