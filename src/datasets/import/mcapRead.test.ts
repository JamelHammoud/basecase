import { decompress } from 'fzstd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARM_JOINTS,
  armJointStates,
  armPose,
  COMPRESSED_IMAGE_SCHEMA,
  JOINT_STATE_SCHEMA,
  mcapWithChunk,
  writeMcap,
  type FixtureMessage,
} from './mcapFixtures';
import { MCAP_COMPRESSION, MCAP_NO_JOINTS, MCAP_TOO_LARGE, MCAP_TOO_LONG, readMcap } from './mcapRead';
import { encodeCompressedImage, encodeJointState, MCAP_DAMAGED } from './ros2Cdr';
import { DataImportError, IMPORT_LIMITS } from './types';

vi.mock('fzstd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fzstd')>();

  return { ...actual, decompress: vi.fn(actual.decompress) };
});

const IMAGE_TOPIC = '/camera/color/image_raw/compressed';

const ns = (seconds: number) => BigInt(Math.round(seconds * 1e9));

const joints = (stamp: number, name: string[], position: number[], logTime = stamp): FixtureMessage => ({
  topic: '/joint_states',
  schema: JOINT_STATE_SCHEMA,
  logTime: ns(logTime),
  data: encodeJointState({ stamp, name, position }),
});

const image = (stamp: number): FixtureMessage => ({
  topic: IMAGE_TOPIC,
  schema: COMPRESSED_IMAGE_SCHEMA,
  logTime: ns(stamp),
  data: encodeCompressedImage({ stamp, format: 'jpeg', data: new Uint8Array(32) }),
});

const read = async (bytes: Uint8Array) => readMcap([{ name: 'run.mcap', bytes }]);

function expectArm(state: Float64Array, t: Float64Array) {
  for (const [frame, time] of t.entries()) {
    const expected = armPose(time);

    for (const [j, value] of expected.entries())
      expect(Math.abs(state[frame * ARM_JOINTS.length + j] - value)).toBeLessThan(1e-9);
  }
}

beforeEach(() => {
  vi.mocked(decompress).mockClear();
});

describe('readMcap', () => {
  it.each([
    ['unchunked', {}],
    ['chunked', { chunked: true, chunkSize: 2048 }],
  ])('reads an arm’s 100 Hz joint states back on the 50 Hz grid (%s)', async (_, options) => {
    const bytes = await writeMcap(armJointStates({ hz: 100, seconds: 2, start: 1000 }), options);
    const data = await read(bytes);
    const [episode] = data.episodes;

    expect(data).toMatchObject({ format: 'mcap', robotType: null, names: ARM_JOINTS });
    expect(data.episodes).toHaveLength(1);
    expect(episode).toMatchObject({ index: 0, task: null, action: null, videos: [] });
    expect(episode.t).toHaveLength(101);
    expect(episode.t[50]).toBe(1);
    expect(episode.state).toHaveLength(101 * ARM_JOINTS.length);
    expectArm(episode.state, episode.t);
  });

  it('reads zstd chunks', async () => {
    const bytes = await writeMcap(armJointStates({ hz: 100, seconds: 1, start: 5 }), {
      compression: 'zstd',
      chunkSize: 4096,
    });
    const [episode] = (await read(bytes)).episodes;

    expect(decompress).toHaveBeenCalled();
    expect(episode.t).toHaveLength(51);
    expectArm(episode.state, episode.t);
  });

  it('sorts irregular, out-of-order stamps and holds each joint outside its own samples', async () => {
    const line = (time: number) => 2 * time + 1;
    const messages = [0.05, 0, 0.1, 0.013, 0.031].map((time) => joints(10 + time, ['a'], [line(time)]));
    const late = [0.07, 0.031].map((time) => joints(10 + time, ['b'], [-line(time)]));
    const data = await read(await writeMcap([...messages, ...late]));
    const [episode] = data.episodes;

    expect(data.names).toEqual(['a', 'b']);
    expect([...episode.t]).toEqual([0, 0.02, 0.04, 0.06, 0.08, 0.1]);

    for (const [frame, time] of episode.t.entries()) {
      const held = Math.min(Math.max(time, 0.031), 0.07);

      expect(episode.state[frame * 2]).toBeCloseTo(line(time), 9);
      expect(episode.state[frame * 2 + 1]).toBeCloseTo(-line(held), 9);
    }
  });

  it('falls back to the log time when the header stamp is zero', async () => {
    const messages = [0, 0.5, 1].map((time) => joints(0, ['a'], [time], 200 + time));
    const [episode] = (await read(await writeMcap(messages))).episodes;

    expect(episode.t).toHaveLength(51);
    expect(episode.state[25]).toBeCloseTo(0.5, 9);
  });

  it('turns an image topic into a video with its frame count and span', async () => {
    const arm = armJointStates({ hz: 100, seconds: 2, start: 1000 });
    const frames = Array.from({ length: 30 }, (_, i) => image(1000.1 + i / 30));
    const [episode] = (await read(await writeMcap([...arm, ...frames], { chunked: true }))).episodes;

    expect(episode.videos).toHaveLength(1);
    expect(episode.videos[0]).toMatchObject({ camera: IMAGE_TOPIC, path: 'run.mcap', frames: 30 });
    expect(episode.videos[0].from).toBeCloseTo(0.1, 6);
    expect(episode.videos[0].to).toBeCloseTo(0.1 + 29 / 30, 6);
  });

  it('refuses a recording without joint states', async () => {
    await expect(read(await writeMcap([image(1), image(2)]))).rejects.toThrow(MCAP_NO_JOINTS);
  });

  it('refuses a position that isn’t a number', async () => {
    const bytes = await writeMcap([joints(1, ['a'], [0]), joints(1.1, ['a'], [Number.NaN])]);

    await expect(read(bytes)).rejects.toThrow('This MCAP file holds a value that isn’t a number.');
  });

  it('refuses a recording longer than the limit', async () => {
    const bytes = await writeMcap([joints(1, ['a'], [0]), joints(2 + IMPORT_LIMITS.seconds, ['a'], [0])]);

    await expect(read(bytes)).rejects.toThrow(MCAP_TOO_LONG);
  });

  it('refuses a truncated message and a truncated file', async () => {
    const cut = {
      ...joints(1, ['a'], [0]),
      data: encodeJointState({ stamp: 1, name: ['a'], position: [0] }).slice(0, 30),
    };
    const whole = await writeMcap(armJointStates({ hz: 100, seconds: 1, start: 5 }), { chunked: true });

    await expect(read(await writeMcap([cut]))).rejects.toThrow(MCAP_DAMAGED);
    await expect(read(whole.subarray(0, whole.length - 20))).rejects.toThrow(MCAP_DAMAGED);
    await expect(read(new Uint8Array())).rejects.toThrow(MCAP_DAMAGED);
  });

  it('refuses lz4 chunks', async () => {
    const bytes = await writeMcap(armJointStates({ hz: 100, seconds: 1, start: 5 }), { compression: 'lz4' });

    await expect(read(bytes)).rejects.toThrow(MCAP_COMPRESSION);
  });

  it.each(['zstd', ''])('refuses a chunk declaring more than the cap before inflating it (%j)', async (compression) => {
    const bytes = mcapWithChunk({ compression, uncompressedSize: 1n << 40n });
    const error = await read(bytes).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DataImportError);
    expect((error as Error).message).toBe(MCAP_TOO_LARGE);
    expect(decompress).not.toHaveBeenCalled();
  });

  it('refuses a file over the size cap without reading it', async () => {
    const bytes = new Uint8Array(8);

    Object.defineProperty(bytes, 'byteLength', { value: IMPORT_LIMITS.fileBytes + 1 });

    await expect(read(bytes)).rejects.toThrow(MCAP_TOO_LARGE);
  });
});
