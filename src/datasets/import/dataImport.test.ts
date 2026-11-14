import { describe, expect, it } from 'vitest';
import { rosJointNames } from '../../robot/ros2';
import type { SimModel } from '../../sim/mjcfTypes';
import { importHandlers } from './dataImportJobs';
import { lerobotDataset, namedArm, sceneModel, SO101_JOINTS, sweepDeg } from './fixtures';
import { hubDatasetRef, hubImportSource } from './hubSource';
import type { ImportTarget } from './importedTries';
import { importStep, matchInput } from './importPlan';
import { armJointStates, armPose, ARM_JOINTS, writeMcap } from './mcapFixtures';
import { sourceTransfer, type ImportSource } from './readSource';
import type { TryOrigin } from '../../cases/tryFile';

const D2R = Math.PI / 180;

const filesSource = (name: string, files: Record<string, Uint8Array>): ImportSource => ({
  kind: 'files',
  name,
  files: Object.entries(files).map(([path, bytes]) => ({ path, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) })),
});

async function importInto(model: SimModel, source: ImportSource, origin?: TryOrigin) {
  const handlers = importHandlers();
  const read = await handlers.read(source);

  if (!read) throw new Error('not a dataset');

  const step = importStep({ input: matchInput(read, model), model, robotType: read.robotType, remembered: null });

  if (step.kind !== 'ready') throw new Error(`expected a ready plan, got ${step.kind}`);

  const target: ImportTarget = {
    sceneId: 'scene-1',
    modelHash: 'model',
    origin: origin ?? { kind: 'file', name: source.name, hash: read.hash },
    startedAt: '2026-11-14T00:00:00.000Z',
  };
  const built = await handlers.build({ model, plan: step.plan, target });

  return { read, built, model };
}

function qposAt(
  model: SimModel,
  built: Awaited<ReturnType<typeof importInto>>['built'],
  q: { joint: string; frame: number; at?: number },
) {
  const { recording } = built.kept[q.at ?? 0];
  const address = recording.jointQpos![model.joints.findIndex((j) => j.id === q.joint)];

  return recording.qpos[q.frame * recording.nq + address];
}

describe('importing LeRobot datasets', () => {
  it('splits an SO-101 v3 dataset from a Hub link into one try per episode', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const names = SO101_JOINTS.map((n) => `${n}.pos`);
    const files = lerobotDataset({ names, lengths: [12, 9, 15], value: (n, c, k) => sweepDeg(n + k, c) });
    const ref = hubDatasetRef('https://huggingface.co/datasets/lerobot/so101_pick/tree/main');
    const reply = {
      repo: 'lerobot/so101_pick',
      revision: 'b'.repeat(40),
      files,
    };
    const origin: TryOrigin = { kind: 'hub', repo: reply.repo, revision: reply.revision };
    const source = hubImportSource(reply)!;
    const { read, built } = await importInto(model, source, origin);

    expect(ref).toEqual({ owner: 'lerobot', repo: 'so101_pick', rev: 'main' });
    expect(sourceTransfer(source)).toHaveLength(new Set(Object.values(files).map((b) => b.buffer)).size);
    expect(read).toMatchObject({ format: 'lerobot-v3.0', robotType: 'so101_follower', episodes: 3 });
    expect(built.kept.map((k) => k.recording.frames)).toEqual([12, 9, 15]);
    expect(built.kept.map((k) => k.stored.task)).toEqual(['Pick up cube 1', 'Pick up cube 2', 'Pick up cube 3']);
    expect(built.kept[1].stored.origin).toEqual(origin);
    expect(built.kept.every((k) => k.stored.videos!.length === 0)).toBe(true);
    expect(qposAt(model, built, { joint: 'wrist_flex', frame: 4, at: 2 })).toBeCloseTo(sweepDeg(6, 3) * D2R, 5);
  });

  it('reads a Koch v2.1 folder onto the scene’s arm', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const names = SO101_JOINTS.map((n) => `main_${n}`);
    const files = lerobotDataset({ names, lengths: [10], value: sweepDeg, version: 'v2.1', robotType: 'koch' });
    const { built } = await importInto(model, filesSource('koch_pick', files));

    expect(built.kept).toHaveLength(1);
    expect(qposAt(model, built, { joint: 'gripper', frame: 9 })).toBeCloseTo(sweepDeg(9, 5) * D2R, 5);
  });

  it('adds nothing new when the same folder is imported twice', async () => {
    const model = sceneModel([namedArm(SO101_JOINTS)]);
    const files = lerobotDataset({
      names: SO101_JOINTS,
      lengths: [6, 6],
      value: (n, c, k) => sweepDeg(n * (k + 1), c),
    });
    const first = await importInto(model, filesSource('pick', files));
    const again = await importInto(model, filesSource('pick', files));

    expect(again.built.kept.map((k) => k.stored.id)).toEqual(first.built.kept.map((k) => k.stored.id));
    expect(again.read.hash).toBe(first.read.hash);
  });
});

describe('importing ROS 2 recordings', () => {
  const arm = () => namedArm(ARM_JOINTS, { range: [-180, 180] });

  it('round-trips an MCAP recorded from the emulated ros2_control arm', async () => {
    const robot = arm();
    const model = sceneModel([robot]);
    const names = rosJointNames(robot.joints);
    const mcap = await writeMcap(armJointStates({ hz: 100, seconds: 2, start: 1_700_000_000 }));
    const { read, built } = await importInto(model, filesSource('arm.mcap', { 'arm.mcap': mcap }));

    expect(names).toEqual(ARM_JOINTS);
    expect(read).toMatchObject({ format: 'mcap', names: ARM_JOINTS });
    expect(built.kept[0].recording.frames).toBe(101);
    expect(built.kept[0].recording.dt).toBeCloseTo(0.02, 9);
    expect(qposAt(model, built, { joint: 'joint3', frame: 50 })).toBeCloseTo(armPose(1)[2], 6);
    expect(built.kept[0].stored.origin).toMatchObject({ kind: 'file', name: 'arm.mcap' });
  });

  it('reads a rosbag2 folder stored as MCAP through its metadata.yaml', async () => {
    const model = sceneModel([arm()]);
    const [a, b] = await Promise.all([
      writeMcap(armJointStates({ hz: 50, seconds: 1, start: 100 })),
      writeMcap(armJointStates({ hz: 50, seconds: 1, start: 101.02 })),
    ]);
    const yaml = [
      'rosbag2_bagfile_information:',
      '  version: 9',
      '  storage_identifier: mcap',
      '  relative_file_paths:',
      '    - bag_0.mcap',
      '    - bag_1.mcap',
    ].join('\n');
    const files = { 'bag/metadata.yaml': new TextEncoder().encode(yaml), 'bag/bag_0.mcap': a, 'bag/bag_1.mcap': b };
    const { read, built } = await importInto(model, filesSource('bag', files));

    expect(read.format).toBe('mcap');
    expect(built.kept[0].recording.frames).toBeGreaterThan(100);
  });

  it('says a folder with neither is not data', async () => {
    const read = await importHandlers().read(filesSource('robot', { 'robot.urdf': new Uint8Array([60]) }));

    expect(read).toBeNull();
  });

  it('leaves a robot folder with its own metadata.yaml to robot import', async () => {
    const yaml = new TextEncoder().encode('name: so101\nversion: 2\n');
    const files = { 'so101/robot.urdf': new Uint8Array([60]), 'so101/config/metadata.yaml': yaml };
    const read = await importHandlers().read(filesSource('so101', files));

    expect(read).toBeNull();
  });

  it('leaves a robot folder with a meta/info.json that isn’t a dataset to robot import', async () => {
    const info = new TextEncoder().encode('{"name":"so101","version":2}');
    const files = { 'so101/robot.urdf': new Uint8Array([60]), 'so101/meta/info.json': info };
    const read = await importHandlers().read(filesSource('so101', files));

    expect(read).toBeNull();
  });
});
