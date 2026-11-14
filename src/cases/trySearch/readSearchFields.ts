import type { TryVerdict } from '../tryFile';
import { MOTION_SAMPLES, type MotionTrace, type TrySegment } from './types';

export interface SearchFields {
  task?: string;
  instruction?: string;
  tags?: string[];
  segments?: TrySegment[];
  motion?: MotionTrace;
}

type Raw = Record<string, unknown>;

const MAX_TEXT = 4096;
const MAX_TAGS = 64;
const MAX_TAG = 64;
const MAX_SEGMENTS = 512;
const VERDICTS: TryVerdict[] = ['passed', 'failed', 'unjudged'];
const SAFE_ID = /^[\w-]{1,128}$/;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

const readTags = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= MAX_TAGS && v.every((t) => isText(t, MAX_TAG)) ? (v as string[]) : null;

const numbers = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every(isNum);

function readSegment(v: unknown): TrySegment | null {
  if (!isObject(v) || typeof v.id !== 'string' || !SAFE_ID.test(v.id) || !isText(v.label, 256)) return null;

  if (!isNum(v.start) || !isNum(v.end) || v.end < v.start) return null;

  const tags = v.tags === undefined ? [] : readTags(v.tags);

  if (!tags || (v.outcome !== undefined && !VERDICTS.includes(v.outcome as TryVerdict))) return null;

  return {
    id: v.id,
    label: v.label,
    start: v.start,
    end: v.end,
    ...(v.tags !== undefined ? { tags } : {}),
    ...(v.outcome !== undefined ? { outcome: v.outcome as TryVerdict } : {}),
  };
}

function readSegments(v: unknown): TrySegment[] | null {
  if (!Array.isArray(v) || v.length > MAX_SEGMENTS) return null;

  const segments = v.map(readSegment);

  return segments.every((s) => s) ? (segments as TrySegment[]) : null;
}

export function readMotion(v: unknown): MotionTrace | null {
  if (!isObject(v) || (v.body !== 'fixed' && v.body !== 'mobile')) return null;

  if (!Number.isInteger(v.joints) || (v.joints as number) < 0) return null;

  if (!numbers(v.path, MOTION_SAMPLES * 3) || !numbers(v.speed, MOTION_SAMPLES)) return null;

  return { body: v.body, joints: v.joints as number, path: v.path, speed: v.speed };
}

const READERS: Record<keyof SearchFields, (v: unknown) => unknown> = {
  task: (v) => (isText(v, MAX_TEXT) ? v : null),
  instruction: (v) => (isText(v, MAX_TEXT) ? v : null),
  tags: readTags,
  segments: readSegments,
  motion: readMotion,
};

export function readSearchFields(value: Raw): SearchFields | null {
  const fields: Record<string, unknown> = {};

  for (const [key, read] of Object.entries(READERS)) {
    if (value[key] === undefined) continue;

    const field = read(value[key]);

    if (field === null) return null;

    fields[key] = field;
  }

  return fields as SearchFields;
}
