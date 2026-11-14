import { TRY_SOURCE_BADGE, type StoredTry, type TrySource, type TryVerdict } from '../tryFile';
import { motionKey, motionSignature } from './motion';
import type { TrySegment } from './types';

export interface Entry {
  id: string;
  tryId: string;
  segmentId: string | null;
  label: string;
  robot: string;
  sceneId: string;
  input: string | null;
  source: TrySource;
  verdict: TryVerdict;
  seconds: number;
  length: number;
  startedAt: string;
  time: number;
  at: number;
  end: number | null;
  faulted: boolean;
  key: string | null;
  signature: Int8Array | null;
  slot: number;
  parent: number;
}

export type EntryFacts = Omit<Entry, 'slot' | 'parent'>;

export type TryDoc = {
  label: string;
  task: string;
  instruction: string;
  tags: string;
  robot: string;
  source: string;
  input: string;
};

export interface SegmentDoc {
  id: string;
  own: string;
}

export const TRY_BOOSTS = { label: 2, tags: 2 };

export const SEGMENT_BOOSTS = {};

export const entryId = (tryId: string, segmentId: string | null) => (segmentId ? `${tryId}/${segmentId}` : tryId);

function singular(term: string): string {
  if (term.length <= 3 || term.endsWith('ss') || term.endsWith('us')) return term;

  if (term.endsWith('ies')) return `${term.slice(0, -3)}y`;

  if (/(?:s|x|ch|sh)es$/.test(term)) return term.slice(0, -2);

  return term.endsWith('s') ? term.slice(0, -1) : term;
}

function withoutEnding(term: string): string {
  const ending = /(?:ing|ed)$/.exec(term);
  const root = ending ? term.slice(0, ending.index) : term;

  if (!ending || root.length < 3) return term;

  return /([^aeioulsz])\1$/.test(root) ? root.slice(0, -1) : root;
}

export function stem(term: string): string {
  const root = withoutEnding(singular(term));

  return root.length > 3 && root.endsWith('e') ? root.slice(0, -1) : root;
}

export function quantized(vector: ArrayLike<number>): Int8Array {
  let norm = 0;

  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];

  const scale = norm > 0 ? 127 / Math.sqrt(norm) : 0;

  return Int8Array.from(vector, (v) => Math.round(v * scale));
}

const sourceText = (source: TrySource) => [TRY_SOURCE_BADGE[source], source].filter(Boolean).join(' ');

function tryDoc(stored: StoredTry): TryDoc {
  return {
    label: stored.case?.name ?? '',
    task: stored.task ?? '',
    instruction: stored.instruction ?? '',
    tags: (stored.tags ?? []).join(' '),
    robot: stored.robot.name,
    source: sourceText(stored.source),
    input: stored.input ?? '',
  };
}

function tryEntry(stored: StoredTry): EntryFacts {
  const time = Date.parse(stored.startedAt);

  return {
    id: stored.id,
    tryId: stored.id,
    segmentId: null,
    label: stored.case?.name ?? stored.robot.name,
    robot: stored.robot.name,
    sceneId: stored.sceneId,
    input: stored.input,
    source: stored.source,
    verdict: stored.outcome.verdict,
    seconds: stored.seconds,
    length: stored.seconds,
    startedAt: stored.startedAt,
    time: Number.isFinite(time) ? time : 0,
    at: 0,
    end: null,
    faulted: stored.faults.length > 0,
    key: stored.motion ? motionKey(stored.motion) : null,
    signature: stored.motion ? quantized(motionSignature(stored.motion)) : null,
  };
}

function segmentSignature(stored: StoredTry, segment: TrySegment): Int8Array | null {
  if (!stored.motion || stored.seconds <= 0) return null;

  const from = Math.max(0, Math.min(1, segment.start / stored.seconds));
  const to = Math.max(from, Math.min(1, segment.end / stored.seconds));

  return quantized(motionSignature(stored.motion, { from, to }));
}

function segmentEntry(stored: StoredTry, base: EntryFacts, segment: TrySegment): EntryFacts {
  return {
    ...base,
    id: entryId(stored.id, segment.id),
    segmentId: segment.id,
    label: segment.label,
    verdict: segment.outcome ?? base.verdict,
    length: segment.end - segment.start,
    at: segment.start,
    end: segment.end,
    signature: segmentSignature(stored, segment),
  };
}

export interface TryDocs {
  entries: EntryFacts[];
  tryDoc: TryDoc;
  segmentDocs: SegmentDoc[];
}

export function docsOf(stored: StoredTry): TryDocs {
  const base = tryEntry(stored);
  const segments = stored.segments ?? [];

  return {
    entries: [base, ...segments.map((s) => segmentEntry(stored, base, s))],
    tryDoc: tryDoc(stored),
    segmentDocs: segments.map((s) => ({ id: entryId(stored.id, s.id), own: [s.label, ...(s.tags ?? [])].join(' ') })),
  };
}
