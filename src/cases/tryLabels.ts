import type { StoredTry, TryVerdict } from './tryFile';

export const SEGMENT_VERBS = [
  'reach',
  'grasp',
  'lift',
  'carry',
  'place',
  'release',
  'push',
  'walk',
  'turn',
  'stand',
  'sit',
  'wave',
  'idle',
] as const;

export type SegmentVerb = (typeof SEGMENT_VERBS)[number];

export interface TrySegment {
  from: number;
  to: number;
  label: string;
  instruction?: string;
  tags?: string[];
}

export const FLAG_KINDS = ['joint-limit', 'frame-gap', 'effort', 'idle', 'model'] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];

export interface QualityFlag {
  kind: FlagKind;
  at: number;
  joint?: string;
}

export type LabelSource = 'rule' | 'agent' | 'person';

export interface TryLabels {
  segments: TrySegment[];
  by: LabelSource;
  tags: string[];
  flags: QualityFlag[];
  instruction?: string;
}

export const LABEL_LIMITS = { segments: 200, tags: 32, tag: 64, label: 128, instruction: 500, flags: 100 };

export const segmentLabel = (verb: SegmentVerb, object?: string | null) => (object ? `${verb} ${object}` : verb);

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isFrame = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const optionalText = (v: unknown, max: number) => v === undefined || isText(v, max);

const isTags = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= LABEL_LIMITS.tags && v.every((t) => isText(t, LABEL_LIMITS.tag) && t.trim() !== '');

function readSegment(v: unknown): TrySegment | null {
  if (!isObject(v) || !isFrame(v.from) || !isFrame(v.to) || v.to <= v.from) return null;

  if (!isText(v.label, LABEL_LIMITS.label) || !optionalText(v.instruction, LABEL_LIMITS.instruction)) return null;

  if (v.tags !== undefined && !isTags(v.tags)) return null;

  return {
    from: v.from,
    to: v.to,
    label: v.label,
    ...(v.instruction ? { instruction: v.instruction as string } : {}),
    ...(Array.isArray(v.tags) && v.tags.length ? { tags: v.tags as string[] } : {}),
  };
}

function readFlag(v: unknown): QualityFlag | null {
  if (!isObject(v) || !FLAG_KINDS.includes(v.kind as FlagKind)) return null;

  if (typeof v.at !== 'number' || !Number.isFinite(v.at) || !optionalText(v.joint, 128)) return null;

  return { kind: v.kind as FlagKind, at: v.at, ...(v.joint ? { joint: v.joint as string } : {}) };
}

const contiguous = (segments: TrySegment[]) => segments.every((s, i) => i === 0 || s.from === segments[i - 1].to);

const isSource = (v: unknown): v is LabelSource => v === 'rule' || v === 'agent' || v === 'person';

function listOf<T>(v: unknown, max: number, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > max) return null;

  const items = v.map(read);

  return items.every((item) => item !== null) ? (items as T[]) : null;
}

export function readLabels(v: unknown): TryLabels | null {
  if (!isObject(v) || !isSource(v.by) || !isTags(v.tags)) return null;

  if (!optionalText(v.instruction, LABEL_LIMITS.instruction)) return null;

  const segments = listOf(v.segments, LABEL_LIMITS.segments, readSegment);
  const flags = listOf(v.flags, LABEL_LIMITS.flags, readFlag);

  if (!segments || !flags || !contiguous(segments)) return null;

  return {
    segments,
    by: v.by,
    tags: v.tags,
    flags,
    ...(v.instruction ? { instruction: v.instruction as string } : {}),
  };
}

export const emptyLabels = (): TryLabels => ({ segments: [], by: 'rule', tags: [], flags: [] });

export const segmentAt = (segments: TrySegment[], frame: number) =>
  segments.findIndex((s) => frame >= s.from && frame < s.to);

export function splitAt(segments: TrySegment[], frame: number): TrySegment[] | null {
  const index = segmentAt(segments, frame);
  const segment = segments[index];

  if (!segment || frame <= segment.from) return null;

  const rest = { from: segment.from, to: segment.to, label: segment.label };

  return [...segments.slice(0, index), { ...rest, to: frame }, { ...rest, from: frame }, ...segments.slice(index + 1)];
}

export function mergeIntoPrevious(segments: TrySegment[], index: number): TrySegment[] | null {
  if (index < 1 || index >= segments.length) return null;

  const before = segments[index - 1];

  return [...segments.slice(0, index - 1), { ...before, to: segments[index].to }, ...segments.slice(index + 1)];
}

export function moveBoundary(segments: TrySegment[], index: number, frame: number): TrySegment[] | null {
  if (index < 1 || index >= segments.length) return null;

  const before = segments[index - 1];
  const after = segments[index];
  const at = Math.max(before.from + 1, Math.min(after.to - 1, Math.round(frame)));

  if (at === after.from) return null;

  return [...segments.slice(0, index - 1), { ...before, to: at }, { ...after, from: at }, ...segments.slice(index + 1)];
}

export function renameSegment(segments: TrySegment[], index: number, label: string): TrySegment[] | null {
  const text = label.trim().slice(0, LABEL_LIMITS.label);
  const segment = segments[index];

  if (!segment || !text || text === segment.label) return null;

  return segments.map((s, i) => (i === index ? { ...s, label: text } : s));
}

export function tagsFrom(text: string): string[] {
  const tags = text
    .split(',')
    .map((t) => t.trim().replace(/\s+/g, ' ').slice(0, LABEL_LIMITS.tag))
    .filter(Boolean);

  return [...new Set(tags)].slice(0, LABEL_LIMITS.tags);
}

export const sharedTags = (lists: string[][]) =>
  lists.length ? lists[0].filter((tag) => lists.every((list) => list.includes(tag))) : [];

export function retagged(tags: string[], change: { add: string[]; remove: string[] }): string[] {
  const kept = tags.filter((t) => !change.remove.includes(t));

  return [...new Set([...kept, ...change.add])].slice(0, LABEL_LIMITS.tags);
}

export const labelsOf = (stored: StoredTry): TryLabels => stored.labels ?? emptyLabels();

export const withLabels = (stored: StoredTry, change: Partial<TryLabels>): StoredTry => ({
  ...stored,
  labels: { ...labelsOf(stored), ...change },
});

export const canMark = (stored: Pick<StoredTry, 'outcome'>) =>
  stored.outcome.verdict === 'unjudged' || stored.outcome.by === 'person';

export function marked(stored: StoredTry, verdict: Exclude<TryVerdict, 'unjudged'>): StoredTry | null {
  if (!canMark(stored)) return null;

  return { ...stored, outcome: { verdict, margin: null, by: 'person' } };
}

export const labelText = (labels: TryLabels | undefined) =>
  labels
    ? [labels.instruction ?? '', ...labels.tags, ...labels.segments.flatMap((s) => [s.label, s.instruction ?? ''])]
        .filter(Boolean)
        .join(' ')
    : '';
