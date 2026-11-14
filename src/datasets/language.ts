import type { Segment } from './segments';

export const SUBTASK_ANNOTATION = 'annotation.human.action.task_description';
export const LANGUAGE_KEY = 'language_persistent';
export const LANGUAGE_FEATURE = { dtype: 'language', shape: [1], names: null };

export interface DatasetSegment {
  start: number;
  end: number;
  text: string;
}

export interface Subtask {
  from: number;
  text: string;
}

export interface EpisodeText {
  task: string;
  segments: DatasetSegment[];
}

interface Labelled extends Segment {
  instruction?: string;
}

export interface TextLabels {
  segments?: Labelled[];
  instruction?: string;
}

export function episodeText(brief: string, labels: TextLabels | undefined, ruled: Labelled[] = []): EpisodeText {
  const segments = labels?.segments ?? ruled;

  return {
    task: labels?.instruction ?? brief,
    segments: segments.map((s) => ({ start: s.start, end: s.end, text: s.instruction ?? s.label })),
  };
}

export function subtaskRows(segments: DatasetSegment[], frames: number[], task: string): Subtask[] {
  const rows = segments.flatMap((s) => {
    const from = frames.findIndex((f) => f >= s.start);

    return from >= 0 && frames[from] < s.end ? [{ from, text: s.text }] : [];
  });

  return rows[0]?.from === 0 ? rows : [{ from: 0, text: task }, ...rows];
}

interface WithSubtasks {
  task: string;
  subtasks?: Subtask[];
}

export const subtasksOf = (e: WithSubtasks): Subtask[] =>
  e.subtasks?.length ? e.subtasks : [{ from: 0, text: e.task }];

export const subtaskAt = <T extends { from: number }>(subtasks: T[], row: number) =>
  subtasks.findLast((s) => s.from <= row) ?? subtasks[0];

const text = (name: string, repetition: string) => ({
  name,
  type: 'BYTE_ARRAY',
  converted_type: 'UTF8',
  repetition_type: repetition,
});

export const languageSchema = (): Record<string, unknown>[] => [
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
  { ...text('element', 'OPTIONAL'), converted_type: 'JSON' },
];

export interface LanguageRow {
  role: string;
  content: string | null;
  style: string | null;
  timestamp: number;
  camera: string | null;
  tool_calls: string[] | null;
}

export const subtaskLanguage = (subtasks: Subtask[], timestamps: Float32Array): LanguageRow[] =>
  subtasks.map((s) => ({
    role: 'assistant',
    content: s.text,
    style: 'subtask',
    timestamp: timestamps[s.from],
    camera: null,
    tool_calls: null,
  }));
