import { parquetMetadata, parquetReadObjects } from 'hyparquet';
import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import type { TryLabels } from '../cases/tryLabels';
import { DATASET_FPS } from './episodes';
import { FIXTURE_SEGMENTS, fixtureSpec } from './fixtures';
import { dataPath } from './lerobot';
import { datasetFiles, LEGACY_FOLDER } from './lerobotExport';
import { TASK_ANNOTATION } from './lerobotRows';
import { TASKS_PATH, v3DataPath } from './lerobotV3';
import { LANGUAGE_KEY, labelSegments, segmentRows, SUBTASK_ANNOTATION, subtaskRows } from './segmentRows';

type Files = Record<string, Uint8Array>;

type Row = Record<string, unknown>;

const rowsOf = (bytes: Uint8Array) => parquetReadObjects({ file: bytes.slice().buffer });
const columnsOf = (bytes: Uint8Array) => parquetMetadata(bytes.slice().buffer).schema.map((s) => s.name);
const text = (files: Files, path: string) => JSON.parse(strFromU8(files[path]));
const lines = (files: Files, path: string) =>
  strFromU8(files[path])
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Row);

const TASK = 'Touch the point with the end effector.';
const labelled = () => fixtureSpec({ segments: FIXTURE_SEGMENTS });

describe('exporting labelled segments', () => {
  it('maps recording frames to the sampled rows and prefers the agent’s instruction', () => {
    const labels: TryLabels = {
      by: 'agent',
      tags: [],
      flags: [],
      instruction: 'Pick up the block.',
      segments: [
        { from: 0, to: 9, label: 'reach block' },
        { from: 9, to: 10, label: 'idle' },
        { from: 10, to: 30, label: 'grasp block', instruction: 'Close the gripper on the block.' },
      ],
    };
    const segments = labelSegments(labels);

    expect(segments.map((s) => s.text)).toEqual(['reach block', 'idle', 'Close the gripper on the block.']);
    expect(segmentRows(segments, [0, 2, 4, 6, 8, 10, 12, 14])).toEqual([
      { from: 0, to: 5, text: 'reach block' },
      { from: 5, to: 8, text: 'Close the gripper on the block.' },
    ]);
  });

  it('keeps one subtask row per segment when neighbours share a label', () => {
    const split = [
      { from: 0, to: 6, text: 'reach block' },
      { from: 6, to: 14, text: 'reach block' },
    ];
    const rows = subtaskRows({
      segments: segmentRows(split, [0, 2, 4, 6, 8, 10, 12]),
      timestamps: Float32Array.from({ length: 7 }, (_, i) => i / DATASET_FPS),
    });

    expect(rows.map((r) => [r.content, r.timestamp])).toEqual([
      ['reach block', 0],
      ['reach block', Math.fround(3 / DATASET_FPS)],
    ]);
  });

  it('writes subtasks into language_persistent on every frame of their episode', async () => {
    const spec = await labelled();
    const files = await datasetFiles(spec);
    const data = await rowsOf(files[v3DataPath(0)]);
    const info = text(files, 'meta/info.json');
    const tasks = await rowsOf(files[TASKS_PATH]);

    expect(info.features[LANGUAGE_KEY]).toEqual({ dtype: 'language', shape: [1], names: null });
    expect(tasks.map((t) => t.task)).toEqual([TASK]);
    expect(columnsOf(files[v3DataPath(0)])).not.toContain(SUBTASK_ANNOTATION);

    for (const [episode, segments] of FIXTURE_SEGMENTS.entries()) {
      const frames = data.filter((r) => Number(r.episode_index) === episode);
      const expected = segments.map((s) => ({
        role: 'assistant',
        content: s.text,
        style: 'subtask',
        timestamp: Math.fround(s.from / DATASET_FPS),
        camera: null,
        tool_calls: null,
      }));

      expect(frames).toHaveLength(spec.episodes[episode].frames.length);
      expect(frames.every((r) => JSON.stringify(r[LANGUAGE_KEY]) === JSON.stringify(expected))).toBe(true);
    }
  });

  it('indexes each frame’s subtask in the v2.1 tasks for GR00T', async () => {
    const files = await datasetFiles(await labelled());
    const at = (path: string) => `${LEGACY_FOLDER}/${path}`;
    const tasks = lines(files, at('meta/tasks.jsonl')).map((t) => t.task as string);
    const modality = text(files, at('meta/modality.json'));
    const info = text(files, at('meta/info.json'));

    expect(tasks).toEqual([TASK, 'reach point', 'Touch the point, then hold still.', 'touch point']);
    expect(info.total_tasks).toBe(4);
    expect(info.features[SUBTASK_ANNOTATION]).toEqual({ dtype: 'int64', shape: [1], names: null });
    expect(Object.keys(modality.annotation)).toEqual(['human.task_description', 'human.action.task_description']);
    expect(lines(files, at('meta/episodes.jsonl')).map((e) => e.tasks)).toEqual([[TASK], [TASK], [TASK]]);

    for (const [episode, segments] of FIXTURE_SEGMENTS.entries()) {
      const rows = await rowsOf(files[at(dataPath(episode))]);
      const covering = (i: number) => segments.find((s) => i >= s.from && i < s.to)?.text ?? TASK;

      expect(columnsOf(files[at(dataPath(episode))])).not.toContain(LANGUAGE_KEY);
      expect(rows.map((r) => tasks[Number(r[SUBTASK_ANNOTATION])])).toEqual(rows.map((_, i) => covering(i)));
      expect(rows.every((r) => Number(r[TASK_ANNOTATION]) === 0)).toBe(true);
    }
  });

  it('writes the same bytes as before when no try has segments', async () => {
    const plain = await datasetFiles(await fixtureSpec());
    const empty = await datasetFiles(await fixtureSpec({ segments: [[], [], []] }));

    expect(Object.keys(empty)).toEqual(Object.keys(plain));

    for (const [path, bytes] of Object.entries(plain)) expect(empty[path]).toEqual(bytes);

    expect(columnsOf(plain[v3DataPath(0)])).not.toContain(LANGUAGE_KEY);
    expect(columnsOf(plain[`${LEGACY_FOLDER}/${dataPath(0)}`])).not.toContain(SUBTASK_ANNOTATION);
    expect(lines(plain, `${LEGACY_FOLDER}/meta/tasks.jsonl`)).toEqual([{ task_index: 0, task: TASK }]);
  });
});
