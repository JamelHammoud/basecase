import { describe, expect, it, vi } from 'vitest';
import { cameraViews } from '../cameras/views';
import type { CameraTrainingFrame, CameraTrainingRequest } from '../cameras/trainingTypes';
import { fixtureArm, importedStored } from '../datasets/labelFixtures';
import { sceneModel } from '../datasets/import/fixtures';
import type { Recording } from '../sim/recorder';
import { TopicCollector } from '../topics/collector';
import { encodeTopicLog } from '../topics/topicFile';
import { validateFrameSet } from './frameSet';
import { TryFramesSession } from './tryFrames';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const robot = fixtureArm();
const model = sceneModel([robot]);
const recording: Recording = {
  dt: 0.1,
  frames: 3,
  nq: 0,
  nv: 0,
  nu: 0,
  nbody: model.bodies.length,
  t: new Float32Array([0, 0.1, 0.2]),
  ctrl: new Float32Array(),
  qpos: new Float64Array(),
  qvel: new Float32Array(),
  poses: new Float32Array(model.bodies.length * 7 * 3).fill(2),
};
const raw: CameraTrainingFrame = {
  width: 4,
  height: 4,
  jpeg,
  depth: new Float32Array(16).fill(123),
  instanceIds: new Uint32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
  keypoints: [],
  instances: [{ id: 1, instance: robot.parts[0].id }],
  variants: {},
};

describe('frames from saved tries', () => {
  it('renders recorded poses with matching visible instance labels and source timestamps', async () => {
    const stored = { ...(await importedStored(model, recording)), source: 'case' as const };
    const render = vi.fn(async (_request: CameraTrainingRequest) => raw);
    const load = vi.fn(async () => true);
    const session = new TryFramesSession({ load, render });
    const header = await session.load({
      name: 'Arm frames',
      tries: [{ stored, recording }],
      selection: { kind: 'frame', frame: 2 },
      cameras: ['scene'],
      scene: { model, parts: robot.parts, world: [], views: cameraViews(robot.parts, []) },
      width: 4,
      height: 4,
    });
    const frame = await session.next();

    expect(load).toHaveBeenCalledOnce();
    expect(render.mock.calls[0][0]).toMatchObject({ poses: new Float64Array(model.bodies.length * 7).fill(2) });
    expect(render.mock.calls[0][0].randomization).toBeUndefined();
    expect(frame.annotations[0].box).toEqual([1, 1, 2, 2]);
    expect(frame.depth[0]).toBe(123);
    expect(frame.origin).toMatchObject({ tryId: stored.id, frame: 2 });
    expect(frame.origin?.seconds).toBeCloseTo(0.2);
    expect(frame.source).toBe('try');
    validateFrameSet({ ...header, frames: [frame] });
    await expect(session.next()).rejects.toThrow();
  });

  it('reads compressed MCAP topic images on their own clock without creating simulation labels', async () => {
    const collector = new TopicCollector();

    collector.add('/front/compressed', 'sensor_msgs/msg/CompressedImage', 0n, { format: 'jpeg', data: jpeg });
    collector.add('/front/compressed', 'sensor_msgs/msg/CompressedImage', 100_000_000n, {
      format: 'jpeg',
      data: jpeg,
    });

    const recorded = { ...recording, topics: encodeTopicLog(collector.finish(0n)) };
    const stored = await importedStored(model, recorded);
    const session = new TryFramesSession();
    const header = await session.load({
      name: 'MCAP frames',
      tries: [{ stored, recording: recorded }],
      selection: { kind: 'every', step: 1 },
      cameras: ['/front/compressed'],
    });
    const frames = [await session.next(), await session.next(), await session.next()];

    expect(header.classes).toEqual([]);
    expect(frames.map((f) => f.jpeg)).toEqual([jpeg, jpeg, jpeg]);
    expect(new Set(frames.map((f) => f.id)).size).toBe(3);
    expect(frames.every((f) => f.annotations.length === 0 && f.depth.every((n) => n === 0))).toBe(true);
    validateFrameSet({ ...header, frames });
  });

  it('retains unique world-object identities and replays appearance events without pose jitter', async () => {
    const recorded = {
      ...recording,
      world: [
        { at: 0.05, id: 'block', color: '#ff0000' },
        { at: 0.15, id: 'block', visible: false },
      ],
    };
    const stored = await importedStored(model, recorded);
    const render = vi.fn(async (_request: CameraTrainingRequest) => ({
      ...raw,
      instances: [{ id: 1, instance: 'block' }],
    }));
    const session = new TryFramesSession({ load: async () => true, render });
    const header = await session.load({
      name: 'Block frames',
      tries: [{ stored, recording: recorded }],
      selection: { kind: 'range', from: 1, to: 2 },
      cameras: ['scene'],
      scene: {
        model,
        parts: [],
        world: [{ ...robot.parts[0], id: 'block', name: 'Block' }],
        views: cameraViews(robot.parts, []),
      },
    });

    expect(header.classes).toContainEqual({ id: 0, name: 'Block', objectId: 'block', keypoints: [] });
    expect((await session.next()).annotations[0].classId).toBe(0);
    await session.next();
    expect(render.mock.calls[0][0].randomization).toEqual({
      objects: { block: { colors: [{ name: '', color: '#ff0000' }] } },
    });
    expect(render.mock.calls[1][0].randomization).toEqual({
      objects: { block: { colors: [{ name: '', color: '#ff0000' }], visible: false } },
    });
  });

  it('refuses absent cameras and a changed simulation model before rendering', async () => {
    const stored = {
      ...(await importedStored(model, recording)),
      source: 'case' as const,
      robot: {
        name: 'Arm',
        modelHash: 'wrong-model',
        joints: [],
      },
    };
    const session = new TryFramesSession({ load: vi.fn(async () => true) });
    const job = {
      name: 'Frames',
      tries: [{ stored, recording }],
      selection: { kind: 'frame' as const, frame: 0 },
      cameras: ['scene'],
      scene: { model, parts: robot.parts, world: [], views: cameraViews(robot.parts, []) },
    };

    await expect(session.load(job)).rejects.toThrow('model');
    await expect(session.load({ ...job, cameras: ['missing'] })).rejects.toThrow();
  });
});

describe('recorded camera timestamps', () => {
  it('aligns topic images and world events with the recording clock without applying later changes', async () => {
    const collector = new TopicCollector();
    const currentJpeg = Uint8Array.from(jpeg);

    currentJpeg[14] = 1;
    collector.add('/front/compressed', 'sensor_msgs/CompressedImage', 690_000_000n, { data: jpeg });
    collector.add('/front/compressed', 'sensor_msgs/CompressedImage', 700_000_000n, { data: currentJpeg });
    collector.add('/front/compressed', 'sensor_msgs/CompressedImage', 710_000_000n, { data: jpeg });

    const recorded: Recording = {
      ...recording,
      t: new Float32Array([0, 0.7, 0.8]),
      topics: encodeTopicLog(collector.finish(0n)),
      world: [
        { at: 0.7, id: 'block', color: '#ff0000' },
        { at: 0.71, id: 'block', color: '#0000ff', visible: false },
      ],
    };
    const stored = await importedStored(model, recorded);
    const render = vi.fn(async (_request: CameraTrainingRequest) => raw);
    const session = new TryFramesSession({ load: async () => true, render });

    await session.load({
      name: 'Aligned frames',
      tries: [{ stored, recording: recorded }],
      selection: { kind: 'frame', frame: 1 },
      cameras: ['/front/compressed', 'scene'],
      scene: { model, parts: robot.parts, world: [], views: cameraViews(robot.parts, []) },
    });
    expect.soft((await session.next()).jpeg).toEqual(currentJpeg);
    await session.next();
    expect(render.mock.calls[0][0].randomization).toEqual({
      objects: { block: { colors: [{ name: '', color: '#ff0000' }] } },
    });
  });
});
