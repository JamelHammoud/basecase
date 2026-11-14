export const LABEL_MAX = 200;
export const TAG_MAX = 64;

const MAX_TAGS = 32;
const MAX_SEGMENTS = 2000;

export interface TrySegment {
  start: number;
  end: number;
  label: string;
  instruction?: string;
  tags?: string[];
}

export interface TryLabels {
  segments?: TrySegment[];
  instruction?: string;
  tags?: string[];
}

export type LabelPatch = { [K in keyof TryLabels]?: TryLabels[K] | null };

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isFrame = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export const cleanTag = (tag: string) => tag.trim().replace(/\s+/g, ' ').slice(0, TAG_MAX);

function readTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;

  return [...new Set(v.filter((t): t is string => isText(t, TAG_MAX)).map(cleanTag))].slice(0, MAX_TAGS);
}

function readSegment(v: unknown): TrySegment | null {
  if (!isObject(v) || !isFrame(v.start) || !isFrame(v.end) || v.end <= v.start || !isText(v.label, LABEL_MAX)) {
    return null;
  }

  const tags = readTags(v.tags);

  return {
    start: v.start,
    end: v.end,
    label: v.label,
    ...(isText(v.instruction, LABEL_MAX) ? { instruction: v.instruction } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

function readSegments(v: unknown): TrySegment[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_SEGMENTS) return undefined;

  const segments = v.map(readSegment);

  if (segments.some((s) => !s)) return undefined;

  const list = segments as TrySegment[];

  return list.every((s, i) => i === 0 || s.start === list[i - 1].end) ? list : undefined;
}

export function readTryLabels(value: unknown): TryLabels | undefined {
  if (!isObject(value)) return undefined;

  const segments = readSegments(value.segments);
  const tags = readTags(value.tags);

  return {
    ...(segments ? { segments } : {}),
    ...(isText(value.instruction, LABEL_MAX) ? { instruction: value.instruction } : {}),
    ...(tags?.length ? { tags } : {}),
  };
}

export function patched(labels: TryLabels | undefined, patch: LabelPatch): TryLabels {
  const out: Record<string, unknown> = { ...labels };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete out[key];
    else out[key] = value;
  }

  return readTryLabels(out) ?? {};
}

export const withTags = (tags: string[] | undefined, more: string[]) => [
  ...new Set([...(tags ?? []), ...more.map(cleanTag).filter(Boolean)]),
];

export function splitAt(segments: TrySegment[], frame: number): TrySegment[] {
  const i = segments.findIndex((s) => s.start < frame && frame < s.end);

  if (i < 0) return segments;

  const s = segments[i];

  return [...segments.slice(0, i), { ...s, end: frame }, { ...s, start: frame }, ...segments.slice(i + 1)];
}

export function mergeBack(segments: TrySegment[], index: number): TrySegment[] {
  if (index < 1 || index >= segments.length) return segments;

  const before = segments[index - 1];

  return [...segments.slice(0, index - 1), { ...before, end: segments[index].end }, ...segments.slice(index + 1)];
}

export function moveEdge(segments: TrySegment[], index: number, frame: number): TrySegment[] {
  if (index < 1 || index >= segments.length) return segments;

  const before = segments[index - 1];
  const after = segments[index];
  const at = Math.max(before.start + 1, Math.min(after.end - 1, Math.round(frame)));

  if (at === after.start) return segments;

  return segments.map((s, i) => {
    if (i === index - 1) return { ...s, end: at };

    return i === index ? { ...s, start: at } : s;
  });
}

export const renamed = (segments: TrySegment[], index: number, label: string) =>
  segments.map((s, i) => (i === index && isText(label, LABEL_MAX) ? { ...s, label: label.trim() } : s));

export const segmentAt = (segments: TrySegment[], frame: number) =>
  segments.findIndex((s) => s.start <= frame && frame < s.end);
