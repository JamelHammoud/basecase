import { parquetMetadata, parquetReadObjects } from 'hyparquet';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { DATASET_FPS } from './episodes';
import { AVC_DESCRIPTION, FIXTURE_CAMERAS, FIXTURE_INSTRUCTION, fixtureClip, fixtureSpec } from './fixtures';
import { LANGUAGE_FEATURE, LANGUAGE_KEY, SUBTASK_ANNOTATION, type LanguageRow } from './language';
import { joinVideos } from './joinVideos';
import { datasetFiles, LEGACY_FOLDER } from './lerobotExport';
import { SCAN_KEY } from './lerobotRows';
import { EPISODES_PATH, MEGABYTE, TASKS_PATH, v3DataPath, v3VideoPath } from './lerobotV3';

type Files = Record<string, Uint8Array>;

const text = (files: Files, path: string) => JSON.parse(strFromU8(files[path]));
const rowsOf = (bytes: Uint8Array) => parquetReadObjects({ file: bytes.slice().buffer });
const num = (v: unknown) => Number(v);

async function packetTimes(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = (await input.getPrimaryVideoTrack())!;
  const times: number[] = [];

  for await (const packet of new EncodedPacketSink(track).packets()) times.push(packet.timestamp);

  return times;
}

function activeSubtask(row: Record<string, unknown>) {
  const at = Number(row.timestamp);
  const rows = (row[LANGUAGE_KEY] as LanguageRow[]).filter((r) => r.style === 'subtask' && r.timestamp <= at);

  return rows.reduce((a, b) => (b.timestamp >= a.timestamp ? b : a)).content;
}

const legacyLines = (files: Files, path: string) =>
  strFromU8(files[`${LEGACY_FOLDER}/${path}`])
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe('LeRobot v3 datasets beside v2.1', () => {
  it('writes three episodes into one data file and one video per camera whose ranges line up', async () => {
    const spec = await fixtureSpec();
    const files = await datasetFiles(spec);
    const lengths = spec.episodes.map((e) => e.frames.length);
    const episodes = await rowsOf(files[EPISODES_PATH]);
    const data = await rowsOf(files[v3DataPath(0)]);
    const info = text(files, 'meta/info.json');

    expect(Object.keys(files).filter((p) => p.startsWith('data/'))).toEqual([v3DataPath(0)]);
    expect(Object.keys(files).filter((p) => p.startsWith('videos/'))).toEqual(
      FIXTURE_CAMERAS.map((key) => v3VideoPath(key, 0)),
    );
    expect(info).toMatchObject({ codebase_version: 'v3.0', fps: DATASET_FPS, data_files_size_in_mb: 100 });
    expect(info.data_path).toBe('data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet');
    expect(info.features['observation.state'].fps).toBe(DATASET_FPS);
    expect(info.features[SCAN_KEY].shape).toEqual([4]);
    expect(data).toHaveLength(lengths.reduce((n, l) => n + l, 0));

    for (const [i, row] of episodes.entries()) {
      const from = num(row.dataset_from_index);
      const slice = data.slice(from, num(row.dataset_to_index));

      expect(num(row.length)).toBe(lengths[i]);
      expect(slice.every((r) => num(r.episode_index) === i)).toBe(true);
      expect(slice.map((r) => num(r.index))).toEqual(slice.map((_, k) => from + k));
      expect(row.tasks).toEqual([spec.episodes[i].task]);
    }

    for (const key of FIXTURE_CAMERAS) {
      const times = await packetTimes(files[v3VideoPath(key, 0)]);
      const at = `videos/observation.images.${key}`;

      expect(times).toHaveLength(data.length);

      for (const row of episodes) {
        const from = num(row[`${at}/from_timestamp`]);
        const first = num(row.dataset_from_index);
        const last = num(row.dataset_to_index) - 1;

        expect(num(row[`${at}/file_index`])).toBe(0);
        expect(num(row[`${at}/to_timestamp`]) - from).toBeCloseTo(num(row.length) / DATASET_FPS, 6);
        expect(times[first]).toBeCloseTo(from + Number(data[first].timestamp), 4);
        expect(times[last]).toBeCloseTo(from + Number(data[last].timestamp), 4);
      }
    }
  });

  it('counts the same episodes, frames and stats as the v2.1 copy beside it', async () => {
    const files = await datasetFiles(await fixtureSpec());
    const v3 = text(files, 'meta/info.json');
    const legacy = text(files, `${LEGACY_FOLDER}/meta/info.json`);
    const episodes = await rowsOf(files[EPISODES_PATH]);
    const stats = legacyLines(files, 'meta/episodes_stats.jsonl');
    const aggregated = text(files, 'meta/stats.json');

    expect(legacy.codebase_version).toBe('v2.1');
    expect([v3.total_episodes, v3.total_frames, v3.total_tasks]).toEqual([
      legacy.total_episodes,
      legacy.total_frames,
      legacy.total_tasks,
    ]);
    expect(files[`${LEGACY_FOLDER}/meta/modality.json`]).toBeDefined();
    expect(Object.keys(files).some((p) => p.endsWith('.jsonl') && !p.startsWith(LEGACY_FOLDER))).toBe(false);

    for (const [i, row] of episodes.entries()) {
      for (const [feature, byStat] of Object.entries(stats[i].stats as Record<string, Record<string, unknown>>)) {
        for (const [stat, value] of Object.entries(byStat)) {
          expect(
            JSON.parse(
              JSON.stringify(row[`stats/${feature}/${stat}`], (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
            ),
          ).toEqual(value);
        }
      }
    }

    expect(aggregated['observation.state'].count).toEqual([v3.total_frames]);
    expect(aggregated['observation.images.scene'].mean).toHaveLength(3);
  });

  it('names tasks the way pandas reads them back', async () => {
    const spec = await fixtureSpec({ tasks: ['Reach the spot.', 'Touch the dot.'], language: false });
    const files = await datasetFiles(spec);
    const tasks = await rowsOf(files[TASKS_PATH]);
    const pandas = parquetMetadata(files[TASKS_PATH].slice().buffer).key_value_metadata?.find(
      (m) => m.key === 'pandas',
    );

    expect(tasks.map((t) => [num(t.task_index), t.task])).toEqual([
      [0, 'Reach the spot.'],
      [1, 'Touch the dot.'],
    ]);
    expect(JSON.parse(pandas!.value!).index_columns).toEqual(['task']);
  });

  it('writes the same bytes from the same tries', async () => {
    const spec = await fixtureSpec();
    const [first, second] = [await datasetFiles(spec), await datasetFiles(spec)];

    expect(Object.keys(second)).toEqual(Object.keys(first));

    for (const [path, bytes] of Object.entries(first)) expect(second[path]).toEqual(bytes);
  });
});

describe('Subtasks and instructions in LeRobot v3 and v2.1', () => {
  it('writes each episode’s subtasks into language_persistent, and only in v3.0', async () => {
    const files = await datasetFiles(await fixtureSpec());
    const data = await rowsOf(files[v3DataPath(0)]);
    const legacy = await rowsOf(files[`${LEGACY_FOLDER}/data/chunk-000/episode_000000.parquet`]);
    const tasks = legacyLines(files, 'meta/tasks.jsonl').map((t) => t.task);
    const v3Tasks = (await rowsOf(files[TASKS_PATH])).map((t) => t.task);
    const episode = (i: number) => data.filter((r) => num(r.episode_index) === i);

    expect(text(files, 'meta/info.json').features[LANGUAGE_KEY]).toEqual(LANGUAGE_FEATURE);
    expect(text(files, `${LEGACY_FOLDER}/meta/info.json`).features).not.toHaveProperty(LANGUAGE_KEY);
    expect(legacy[0]).not.toHaveProperty(LANGUAGE_KEY);
    expect(v3Tasks).toEqual(tasks);
    expect(data[0][LANGUAGE_KEY]).toEqual([
      { role: 'assistant', content: 'reach point', style: 'subtask', timestamp: 0, camera: null, tool_calls: null },
      expect.objectContaining({ content: 'Touch the point with the tip.', timestamp: Math.fround(6 / DATASET_FPS) }),
    ]);
    expect(activeSubtask(data[5])).toBe('reach point');
    expect(activeSubtask(data[6])).toBe('Touch the point with the tip.');
    expect(episode(1).map(activeSubtask)).toEqual([...Array(4).fill('reach point'), ...Array(5).fill('hold')]);
    expect(episode(2).map((r) => (r[LANGUAGE_KEY] as LanguageRow[]).length)).toEqual(Array(15).fill(1));
    expect(activeSubtask(episode(2)[0])).toBe(tasks[0]);
    expect(data.map((r) => tasks[num(r[SUBTASK_ANNOTATION])])).toEqual(data.map(activeSubtask));
    expect(legacy.map((r) => tasks[num(r[SUBTASK_ANNOTATION])])).toEqual(episode(0).map(activeSubtask));
  });

  it('names the instruction stored on a try as its episode’s task', async () => {
    const files = await datasetFiles(await fixtureSpec());
    const episodes = await rowsOf(files[EPISODES_PATH]);
    const data = await rowsOf(files[v3DataPath(0)]);
    const tasks = (await rowsOf(files[TASKS_PATH])).map((t) => t.task);

    expect(episodes.map((e) => e.tasks)).toEqual([
      ['Touch the point with the end effector.'],
      [FIXTURE_INSTRUCTION],
      ['Touch the point with the end effector.'],
    ]);
    expect(tasks[num(data.find((r) => num(r.episode_index) === 1)!.task_index)]).toBe(FIXTURE_INSTRUCTION);
  });
});

describe('LeRobot v3 files that start over', () => {
  it('rolls data and video over into a second file past the size limit', async () => {
    const spec = await fixtureSpec({ lengths: [40, 40, 40] });
    const single = await datasetFiles(await fixtureSpec({ lengths: [40] }));
    const one = (path: string) => (single[path].byteLength * 2.5) / MEGABYTE;
    const limits = {
      dataMb: one(v3DataPath(0)),
      videoMb: one(`${LEGACY_FOLDER}/videos/chunk-000/observation.images.scene/episode_000000.mp4`),
    };
    const files = await datasetFiles(spec, limits);
    const episodes = await rowsOf(files[EPISODES_PATH]);

    expect(files[v3DataPath(1)]).toBeDefined();
    expect(files[v3VideoPath('scene', 1)]).toBeDefined();
    expect(episodes.map((e) => num(e['data/file_index']))).toEqual([0, 0, 1]);
    expect(episodes.map((e) => num(e['videos/observation.images.scene/file_index']))).toEqual([0, 0, 1]);
    expect(num(episodes[2]['videos/observation.images.scene/from_timestamp'])).toBe(0);
    expect((await rowsOf(files[v3DataPath(1)])).map((r) => num(r.episode_index))).toEqual(Array(40).fill(2));
  });

  it('starts a new video file when an episode was encoded with other settings', async () => {
    const other = AVC_DESCRIPTION.slice();

    other[3] = 11;

    const clips = [
      await fixtureClip({ frames: 5 }),
      await fixtureClip({ frames: 6 }),
      await fixtureClip({ frames: 4, description: other }),
    ];
    const joined = await joinVideos(clips, 100 * MEGABYTE);

    expect(joined.files).toHaveLength(2);
    expect(joined.spans).toEqual([
      { file: 0, from: 0, to: 0.2 },
      { file: 0, from: 0.2, to: 0.44 },
      { file: 1, from: 0, to: 0.16 },
    ]);
  });
});
