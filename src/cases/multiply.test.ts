import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { COMMAND_WIDTH, readCommand } from '../sim/recordedCommands';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { multiplyBatch, multiplySeeds, replayTry, MULTIPLY_COUNT } from './multiply';
import type { Case } from './schema';
import { drivenTry } from './testing';
import { canMultiply, drivenTries, generatedFrom, generatedTry, type TryRecord } from './tries';
import { FOLLOW_FAR, shiftedCommand, variedWorld } from './variedWorld';

const ARM = fixtureRobots().find((r) => r.id === 'arm-6dof')!;

function armCase(goal: 'pick' | 'touch'): Case {
  const built = buildCase({ goal, world: 'floor' }, builderRobot(buildRig(ARM.joints, ARM.parts), ARM.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

const keysOnly = (kase: Case) => [
  { at: 0.2, command: { v: [1, 0, 0] as V3 } },
  { at: 0.8, command: { v: [0, 1, 0] as V3, aux: [0.5, 0] } },
  { at: 1.4, command: { v: [0, 0, 0] as V3 } },
  { at: kase.task.seconds - 1, command: { v: [-1, 0, 0] as V3 } },
];

const lastQpos = (r: { qpos: Float64Array; nq: number; frames: number }) =>
  Array.from(r.qpos.subarray((r.frames - 1) * r.nq, r.frames * r.nq));

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

describe('a driven try', () => {
  it('records the drive setup and each slot’s command every frame, the arm’s aim as its target', async () => {
    const { job } = await drivenTry(mj, ARM, { kase: armCase('touch'), script: keysOnly });
    const { source } = job;

    expect(source.drive?.kind).toBe('arm');
    expect(source.commandSlots).toBe(1);
    expect(source.commands).toHaveLength(source.frames * COMMAND_WIDTH);

    const early = readCommand(source.commands!, 5 * COMMAND_WIDTH);
    const later = readCommand(source.commands!, 50 * COMMAND_WIDTH);

    expect(later.v).toEqual([0, 1, 0]);
    expect(later.aux).toEqual([0.5, 0]);
    expect(later.target).not.toBeNull();
    expect(Math.hypot(...later.target!.map((x, i) => x - early.target![i]))).toBeGreaterThan(20);
  });

  it('replays with no jitter to the same verdict and joint positions, from keys or targets', async () => {
    for (const driven of [
      await drivenTry(mj, ARM, { kase: armCase('touch'), script: keysOnly }),
      await drivenTry(mj, ARM, { kase: armCase('pick') }),
    ]) {
      const replay = await replayTry(mj, driven.job, null);
      const want = lastQpos(driven.job.source);

      expect(replay.passed).toBe(driven.passed);
      expect(replay.recording.frames).toBe(driven.job.source.frames);
      lastQpos(replay.recording)
        .slice(0, 6)
        .forEach((q, i) => expect(Math.abs(q - want[i])).toBeLessThan(0.02));
    }
  }, 60000);
});

describe('Multiply', () => {
  it('moves an arm target near an object by that object’s offset, block or spot, and the arm at rest not at all', async () => {
    const { job } = await drivenTry(mj, ARM, { kase: armCase('pick') });
    const world = variedWorld(job.model, job.kase, 3);
    const block = world.moved.find((m) => m.id === 'block')!;
    const spot = world.moved.find((m) => m.id === 'spot')!;
    const placed = (id: string) => job.kase.world.objects.find((o) => o.id === id)!.position;
    const reachMm = job.source.drive?.kind === 'arm' ? job.source.drive.reachMm : 0;
    const at = { source: job.source, frame: 0, moved: world.moved, reachMm };
    const shifted = (target: V3) => shiftedCommand({ v: [0, 0, 0], target, aux: [0, 0] }, at).target!;
    const above = (p: V3): V3 => [p[0], p[1] + 30, p[2]];
    const rest = readCommand(job.source.commands!, 0).target!;

    expect(world.moved.map((m) => m.id).sort()).toEqual(['block', 'spot']);
    expect(Math.hypot(...block.offset)).toBeGreaterThan(0);
    expect(block.offset[1]).toBe(0);
    shifted(above(placed('block'))).forEach((x, i) =>
      expect(x).toBeCloseTo(above(placed('block'))[i] + block.offset[i]),
    );
    shifted(above(placed('spot'))).forEach((x, i) => expect(x).toBeCloseTo(above(placed('spot'))[i] + spot.offset[i]));
    expect(Math.hypot(...rest.map((x, i) => x - placed('block')[i]))).toBeGreaterThan(FOLLOW_FAR * reachMm);
    expect(shifted(rest)).toEqual(rest);
    expect(variedWorld(job.model, job.kase, 3)).toEqual(world);
  });

  it('turns one driven Pick Up a Block try into at least 45 passing variations of 50', async () => {
    const driven = await drivenTry(mj, ARM, { kase: armCase('pick') });
    const kept = [];

    expect(driven.passed).toBe(true);

    for (const seeds of multiplySeeds(0, MULTIPLY_COUNT)) kept.push(...(await multiplyBatch(mj, driven.job, seeds)));

    expect(kept.length).toBeGreaterThanOrEqual(45);
    expect(kept.every((v) => v.passed)).toBe(true);
    expect(new Set(kept.map((v) => v.seed)).size).toBe(kept.length);
  }, 600000);

  it('drops every variation that misses', async () => {
    const short = armCase('pick');
    const missed = await drivenTry(mj, ARM, { kase: { ...short, task: { ...short.task, seconds: 2 } } });

    expect(missed.passed).toBe(false);
    expect(await multiplyBatch(mj, missed.job, [1, 2, 3])).toEqual([]);
  }, 60000);
});

describe('generated tries', () => {
  const source: TryRecord = {
    id: 'try-a',
    caseId: 'pick-up-a-block',
    robot: 'Arm',
    at: '2026-11-13T10:00:00.000Z',
    passed: true,
    margin: 0.2,
    seconds: 10,
    manifest: { formatVersion: 1, caseHash: 'c', modelHash: 'm', seed: 0, frames: 500, dt: 0.02, commands: true },
  };

  it('carry their seed and source try, the source’s model, and can’t be multiplied again', async () => {
    const { job } = await drivenTry(mj, ARM, { kase: armCase('touch'), script: keysOnly });
    const made = generatedTry(source, { seed: 7, margin: 0.1, recording: job.source }, 'try-b');

    expect(made.manifest).toMatchObject({ seed: 7, source: 'try-a', modelHash: 'm', caseHash: 'c' });
    expect(made).toMatchObject({ id: 'try-b', caseId: 'pick-up-a-block', passed: true, margin: 0.1 });
    expect(canMultiply(source)).toBe(true);
    expect(canMultiply(made)).toBe(false);
    expect(canMultiply({ ...source, manifest: { ...source.manifest, commands: undefined } })).toBe(false);
    expect(drivenTries([source, made])).toEqual([source]);
    expect(generatedFrom([source, made], 'try-a')).toEqual([made]);
  });

  it('take seeds after the ones already used, in batches', () => {
    expect(multiplySeeds(50, 12, 5)).toEqual([
      [51, 52, 53, 54, 55],
      [56, 57, 58, 59, 60],
      [61, 62],
    ]);
  });
});
