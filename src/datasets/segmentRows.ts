import type { TryLabels } from '../cases/tryLabels';
import type { DatasetSegment, EpisodeData } from './episodes';
import { perFrame, scalarFeature, taskListOf, type DatasetSpec, type FrameColumn, type Placed } from './lerobotRows';

export const LANGUAGE_KEY = 'language_persistent';
export const SUBTASK_ANNOTATION = 'annotation.human.action.task_description';

export const labelSegments = (labels: TryLabels | undefined): DatasetSegment[] =>
  (labels?.segments ?? []).map((s) => ({ from: s.from, to: s.to, text: s.instruction?.trim() || s.label }));

function firstRowAt(frames: number[], frame: number) {
  const row = frames.findIndex((f) => f >= frame);

  return row < 0 ? frames.length : row;
}

export const segmentRows = (segments: DatasetSegment[], frames: number[]): DatasetSegment[] =>
  segments
    .map((s) => ({ from: firstRowAt(frames, s.from), to: firstRowAt(frames, s.to), text: s.text }))
    .filter((s) => s.to > s.from);

export const hasSegments = (spec: Pick<DatasetSpec, 'episodes'>) =>
  spec.episodes.some((e) => (e.segments ?? []).length > 0);

const text = (name: string, repetition: string) => ({
  name,
  type: 'BYTE_ARRAY',
  converted_type: 'UTF8',
  repetition_type: repetition,
});

const LANGUAGE_SCHEMA = [
  { name: LANGUAGE_KEY, repetition_type: 'OPTIONAL', converted_type: 'LIST', num_children: 1 },
  { name: 'list', repetition_type: 'REPEATED', num_children: 1 },
  { name: 'element', repetition_type: 'OPTIONAL', num_children: 6 },
  text('role', 'REQUIRED'),
  text('content', 'OPTIONAL'),
  text('style', 'OPTIONAL'),
  { name: 'timestamp', type: 'FLOAT', repetition_type: 'REQUIRED' },
  text('camera', 'OPTIONAL'),
  { name: 'tool_calls', repetition_type: 'OPTIONAL', converted_type: 'LIST', num_children: 1 },
  { name: 'list', repetition_type: 'REPEATED', num_children: 1 },
  text('element', 'OPTIONAL'),
];

export const subtaskRows = (data: Pick<EpisodeData, 'segments' | 'timestamps'>) =>
  (data.segments ?? []).map((s) => ({
    role: 'assistant',
    content: s.text,
    style: 'subtask',
    timestamp: data.timestamps[s.from],
    camera: null,
    tool_calls: null,
  }));

const languageColumn: FrameColumn = {
  name: LANGUAGE_KEY,
  schema: LANGUAGE_SCHEMA,
  feature: { dtype: 'language', shape: [1], names: null },
  data: (placed) => placed.flatMap((p) => Array<unknown>(p.data.frames.length).fill(subtaskRows(p.data))),
};

export const languageColumns = (spec: DatasetSpec): FrameColumn[] => (hasSegments(spec) ? [languageColumn] : []);

export const legacyTaskList = (spec: DatasetSpec) => [
  ...new Set([...taskListOf(spec), ...spec.episodes.flatMap((e) => (e.segments ?? []).map((s) => s.text))]),
];

function subtaskAt(p: Placed, row: number, tasks: string[]) {
  const segment = p.data.segments?.find((s) => row >= s.from && row < s.to);

  return segment ? tasks.indexOf(segment.text) : p.at.task;
}

const subtaskColumn = (tasks: string[]): FrameColumn => ({
  name: SUBTASK_ANNOTATION,
  schema: [{ name: SUBTASK_ANNOTATION, type: 'INT64', repetition_type: 'REQUIRED' }],
  feature: scalarFeature('int64'),
  data: (placed) => perFrame(placed, (p, i) => BigInt(subtaskAt(p, i, tasks))),
});

export const subtaskColumns = (spec: DatasetSpec): FrameColumn[] =>
  hasSegments(spec) ? [subtaskColumn(legacyTaskList(spec))] : [];
