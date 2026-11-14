import { strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { columnStats, DATASET_FPS } from '../episodes';
import { lerobotFiles } from '../lerobot';
import type { DatasetEpisode, DatasetSpec } from '../lerobotRows';
import { lerobotV3Files } from '../lerobotV3';
import { readLeRobot } from './lerobotRead';
import { isLeRobotFolder } from './sourceKind';
import { DataImportError, IMPORT_LIMITS, type SourceData, type SourceFolder } from './types';

type Files = Record<string, Uint8Array>;

const KOCH = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'].map(
  (n) => `main_${n}`,
);
const SO101 = ['shoulder_pan.pos', 'shoulder_lift.pos', 'elbow_flex.pos', 'wrist_flex.pos', 'wrist_roll.pos'];
const fakeVideo = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

interface SpecOptions {
  names: string[];
  lengths: number[];
  cameras: string[];
  robotType?: string;
}

const valuesOf = (length: number, width: number, seed: number) =>
  Float32Array.from({ length: length * width }, (_, i) => seed + i / 8);

function episode(length: number, seed: number, { names, cameras }: Omit<SpecOptions, 'lengths'>): DatasetEpisode {
  return {
    task: seed % 2 ? 'Stack the cube.' : 'Pick up the cube.',
    frames: Array.from({ length }, (_, i) => i),
    timestamps: Float32Array.from({ length }, (_, i) => i / DATASET_FPS),
    state: valuesOf(length, names.length, seed),
    action: valuesOf(length, names.length, -seed),
    videos: Object.fromEntries(cameras.map((c) => [c, fakeVideo])),
    imageStats: Object.fromEntries(cameras.map((c) => [c, columnStats([0.1, 0.2, 0.3], 3)])),
    source: {},
  };
}

function spec({ names, lengths, cameras, robotType = 'koch' }: SpecOptions): DatasetSpec {
  return {
    robotType,
    jointNames: names,
    videos: cameras.map((key) => ({ key, width: 64, height: 48, codec: 'h264' })),
    episodes: lengths.map((length, i) => episode(length, i, { names, cameras })),
    source: {},
  };
}

function v3Files(s: DatasetSpec): Files {
  let at = 0;
  const spans = s.episodes.map((e) => {
    const from = at;

    at += e.frames.length / DATASET_FPS;

    return { file: 0, from, to: at };
  });
  const videos = Object.fromEntries(s.videos.map((v) => [v.key, { files: [fakeVideo], spans }]));

  return lerobotV3Files(s, videos);
}

const patchInfo = (files: Files, patch: (info: Record<string, unknown>) => void): Files => {
  const info = JSON.parse(strFromU8(files['meta/info.json']));

  patch(info);

  return { ...files, 'meta/info.json': strToU8(JSON.stringify(info)) };
};

interface FolderOptions {
  prefix?: string;
  sizes?: Record<string, number>;
}

function folderOf(files: Files, { prefix = '', sizes = {} }: FolderOptions = {}) {
  const reads: string[] = [];
  const folder: SourceFolder = {
    name: 'dataset',
    files: Object.entries(files).map(([path, bytes]) => ({
      path: `${prefix}${path}`,
      size: sizes[path] ?? bytes.byteLength,
      read: async () => {
        reads.push(path);

        return bytes;
      },
    })),
  };

  return { folder, reads };
}

const kochFiles = () =>
  patchInfo(lerobotFiles(spec({ names: KOCH, lengths: [10, 7], cameras: ['laptop', 'phone'] })), (info) => {
    const features = info.features as Record<string, Record<string, unknown>>;

    features['observation.state'].names = { motors: KOCH };
    features.action.names = { motors: KOCH };
  });

const so101Spec = () =>
  spec({ names: SO101, lengths: [12, 9, 15], cameras: ['front', 'wrist'], robotType: 'so101_follower' });

const read = async (folder: SourceFolder): Promise<SourceData> =>
  (await readLeRobot(folder)) ?? expect.unreachable('read as not LeRobot');

async function refusal(files: Files, options?: FolderOptions) {
  const error = await readLeRobot(folderOf(files, options).folder).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(DataImportError);

  return (error as Error).message;
}

describe('reading LeRobot v2.x datasets', () => {
  it('reads a Koch-style v2.1 folder with object-form joint names', async () => {
    const data = await read(folderOf(kochFiles()).folder);
    const [first, second] = data.episodes;

    expect(data).toMatchObject({ format: 'lerobot-v2.1', robotType: 'koch', names: KOCH });
    expect(data.episodes.map((e) => [e.index, e.task, e.t.length])).toEqual([
      [0, 'Pick up the cube.', 10],
      [1, 'Stack the cube.', 7],
    ]);
    expect(second.state).toHaveLength(7 * KOCH.length);
    expect(second.state[KOCH.length + 2]).toBeCloseTo(1 + (KOCH.length + 2) / 8, 5);
    expect(second.action?.[3]).toBeCloseTo(-1 + 3 / 8, 5);
    expect(first.t[0]).toBe(0);
    expect(first.t[9]).toBeCloseTo(9 / DATASET_FPS, 5);
    expect(second.videos).toEqual([
      {
        camera: 'laptop',
        path: 'videos/chunk-000/observation.images.laptop/episode_000001.mp4',
        from: 0,
        to: 7 / DATASET_FPS,
        frames: 7,
      },
      expect.objectContaining({
        camera: 'phone',
        path: 'videos/chunk-000/observation.images.phone/episode_000001.mp4',
      }),
    ]);
  });

  it('reads v2.0 the same way and never opens a video', async () => {
    const { folder, reads } = folderOf(patchInfo(kochFiles(), (info) => (info.codebase_version = 'v2.0')));
    const data = await read(folder);

    expect(data.format).toBe('lerobot-v2.1');
    expect(data.episodes).toHaveLength(2);
    expect(reads.some((p) => p.endsWith('.mp4'))).toBe(false);
  });

  it('names joints by position and drops an action of another width', async () => {
    const files = patchInfo(kochFiles(), (info) => {
      const features = info.features as Record<string, Record<string, unknown>>;

      features['observation.state'].names = null;
      features.action = { dtype: 'float32', shape: [2], names: null };
    });
    const data = await read(folderOf(files).folder);

    expect(data.names).toEqual(KOCH.map((_, i) => `state_${i}`));
    expect(data.episodes[0].action).toBeNull();
  });
});

describe('reading LeRobot v3.0 datasets', () => {
  it('splits one data file into its SO-101 episodes with each one’s span of the shared videos', async () => {
    const { folder, reads } = folderOf(v3Files(so101Spec()));
    const data = await read(folder);

    expect(data).toMatchObject({ format: 'lerobot-v3.0', robotType: 'so101_follower', names: SO101 });
    expect(data.episodes.map((e) => [e.index, e.t.length, e.state.length])).toEqual([
      [0, 12, 12 * 5],
      [1, 9, 9 * 5],
      [2, 15, 15 * 5],
    ]);
    expect(data.episodes.map((e) => e.t[0])).toEqual([0, 0, 0]);
    expect(data.episodes[2].state[0]).toBeCloseTo(2, 5);
    expect(data.episodes[2].action?.[0]).toBeCloseTo(-2, 5);
    expect(data.episodes[1].videos.map((v) => [v.camera, v.path, v.frames])).toEqual([
      ['front', 'videos/observation.images.front/chunk-000/file-000.mp4', 9],
      ['wrist', 'videos/observation.images.wrist/chunk-000/file-000.mp4', 9],
    ]);
    expect(data.episodes.map((e) => [e.videos[1].from, e.videos[1].to])).toEqual([
      [0, expect.closeTo(12 / DATASET_FPS, 9)],
      [expect.closeTo(12 / DATASET_FPS, 9), expect.closeTo(21 / DATASET_FPS, 9)],
      [expect.closeTo(21 / DATASET_FPS, 9), expect.closeTo(36 / DATASET_FPS, 9)],
    ]);
    expect(reads.filter((p) => p.startsWith('data/'))).toEqual(['data/chunk-000/file-000.parquet']);
    expect(reads.some((p) => p.endsWith('.mp4'))).toBe(false);
  });

  it('reads a dataset with no video', async () => {
    const data = await read(folderOf(v3Files(spec({ names: SO101, lengths: [4, 6], cameras: [] }))).folder);

    expect(data.episodes.map((e) => [e.t.length, e.videos])).toEqual([
      [4, []],
      [6, []],
    ]);
  });

  it('finds a dataset nested one folder deep and keeps its video paths whole', async () => {
    const files = v3Files(so101Spec());
    const nested = { ...files, ...Object.fromEntries(Object.entries(kochFiles()).map(([p, b]) => [`v2.1/${p}`, b])) };
    const data = await read(folderOf(nested, { prefix: 'so101_pick/' }).folder);

    expect(isLeRobotFolder(Object.keys(nested).map((p) => `so101_pick/${p}`))).toBe('so101_pick');
    expect(isLeRobotFolder(Object.keys(files))).toBe('');
    expect(isLeRobotFolder(['README.md', 'data/chunk-000/file-000.parquet'])).toBeNull();
    expect(data.format).toBe('lerobot-v3.0');
    expect(data.episodes[0].videos[0].path).toBe('so101_pick/videos/observation.images.front/chunk-000/file-000.mp4');
  });
});

describe('refusing LeRobot datasets that can’t be trusted', () => {
  it('refuses a parquet with NaN states', async () => {
    const s = spec({ names: KOCH, lengths: [5], cameras: [] });

    s.episodes[0].state[7] = Number.NaN;

    expect(await refusal(lerobotFiles(s))).toBe(
      'The dataset’s data/chunk-000/episode_000000.parquet holds a value that isn’t a number.',
    );
    expect(await refusal(v3Files(s))).toBe(
      'The dataset’s data/chunk-000/file-000.parquet holds a value that isn’t a number.',
    );
  });

  it('refuses a codebase version it doesn’t read', async () => {
    const files = patchInfo(kochFiles(), (info) => (info.codebase_version = 'v1.6'));

    expect(await refusal(files)).toBe('Basecase reads LeRobot v2.0, v2.1 and v3.0 datasets only.');
  });

  it('refuses an oversized file before reading it', async () => {
    const path = 'data/chunk-000/file-000.parquet';
    const files = v3Files(so101Spec());
    const { folder, reads } = folderOf(files, { sizes: { [path]: IMPORT_LIMITS.fileBytes + 1 } });

    await expect(readLeRobot(folder)).rejects.toThrow(`The dataset’s ${path} is too large.`);
    expect(reads).not.toContain(path);
  });

  it('refuses metadata that points outside the dataset or can’t be parsed', async () => {
    const escaping = patchInfo(kochFiles(), (info) => (info.data_path = '../{episode_index:06d}.parquet'));

    expect(await refusal(escaping)).toBe('The dataset’s meta/info.json points outside the dataset.');
    expect(await refusal({ 'README.md': strToU8('hi') })).toBe('This folder isn’t a LeRobot dataset.');
  });

  it('leaves a meta/info.json that isn’t LeRobot’s to robot import', async () => {
    const unparsed = { ...kochFiles(), 'meta/info.json': strToU8('{ "fps": ') };
    const robot = { 'arm/robot.urdf': strToU8('<robot/>'), 'arm/meta/info.json': strToU8('{"name":"arm"}') };

    expect(await readLeRobot(folderOf(unparsed).folder)).toBeNull();
    expect(await readLeRobot(folderOf(robot).folder)).toBeNull();
  });

  it('refuses a dataset without joint state or the data an episode needs', async () => {
    const stateless = patchInfo(
      kochFiles(),
      (info) => delete (info.features as Record<string, unknown>)['observation.state'],
    );
    const missing = { ...kochFiles() };

    delete missing['data/chunk-000/episode_000001.parquet'];

    expect(await refusal(stateless)).toBe('The dataset has no observation.state.');
    expect(await refusal(missing)).toBe('The dataset’s data/chunk-000/episode_000001.parquet is missing.');
  });

  it('refuses timestamps that go backwards and rows of the wrong width', async () => {
    const backwards = spec({ names: KOCH, lengths: [5], cameras: [] });

    backwards.episodes[0].timestamps[3] = 0;

    const narrow = patchInfo(lerobotFiles(spec({ names: KOCH, lengths: [5], cameras: [] })), (info) => {
      const features = info.features as Record<string, Record<string, unknown>>;

      features['observation.state'] = { dtype: 'float32', shape: [5], names: KOCH.slice(0, 5) };
    });

    expect(await refusal(lerobotFiles(backwards))).toBe(
      'The dataset’s data/chunk-000/episode_000000.parquet has timestamps that go backwards.',
    );
    expect(await refusal(narrow)).toBe(
      'The dataset’s data/chunk-000/episode_000000.parquet doesn’t match its metadata.',
    );
  });

  it('refuses an episode longer than the limit', async () => {
    const files = patchInfo(
      lerobotFiles(spec({ names: KOCH, lengths: [5], cameras: [] })),
      (info) => (info.fps = 0.001),
    );

    expect(await refusal(files)).toBe('Episode 0 runs longer than 10 minutes.');
  });
});
