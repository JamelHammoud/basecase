import type { Entry } from './searchDocs';
import type { HitMatch, QueryFilters, TryHit } from './types';

export const FRAME_MIN = 0.18;

export const FRAME_NEAR = 0.02;

export interface StoredFrames {
  at: number[];
  dim: number;
  vectors: Int8Array;
}

type Check = (entry: Entry) => boolean;

const oneOf = (list: string[], read: (entry: Entry) => string | null): Check | null => {
  const wanted = new Set(list.map((v) => v.toLowerCase()));

  return list.length ? (e) => wanted.has(read(e)?.toLowerCase() ?? '') : null;
};

const bounded = (low: number | null, high: number | null, read: (entry: Entry) => number): Check | null =>
  low === null && high === null ? null : (e) => (low === null || read(e) > low) && (high === null || read(e) < high);

export function factFilter(f: QueryFilters): Check {
  const checks = [
    oneOf(f.verdicts, (e) => e.verdict),
    oneOf(f.sources, (e) => e.source),
    oneOf(f.inputs, (e) => e.input),
    oneOf(f.robots, (e) => e.robot),
    bounded(f.after === null ? null : f.after - 1, f.before, (e) => e.time),
    bounded(f.minSeconds, f.maxSeconds, (e) => e.length),
    f.faulted === null ? null : (e: Entry) => e.faulted === f.faulted,
  ].filter((c): c is Check => c !== null);

  return (e) => checks.every((check) => check(e));
}

export const hitOf = (e: Entry, score: number, match: HitMatch): TryHit => ({
  tryId: e.tryId,
  segmentId: e.segmentId,
  label: e.label,
  robot: e.robot,
  sceneId: e.sceneId,
  at: e.at,
  end: e.end,
  score,
  match,
  verdict: e.verdict,
  seconds: e.seconds,
  startedAt: e.startedAt,
});

export const newestFirst = (a: TryHit, b: TryHit) => b.startedAt.localeCompare(a.startedAt);

export const byScore = (a: TryHit, b: TryHit) => b.score - a.score || newestFirst(a, b);

export function bestFrame(frames: StoredFrames, text: Float32Array): { at: number; similarity: number } | null {
  let textNorm = 0;

  for (let k = 0; k < frames.dim; k++) textNorm += text[k] * text[k];

  if (!textNorm || text.length !== frames.dim) return null;

  let best: { at: number; similarity: number } | null = null;
  const scale = 127 * Math.sqrt(textNorm);

  for (let f = 0; f < frames.at.length; f++) {
    let dot = 0;

    for (let k = 0; k < frames.dim; k++) dot += frames.vectors[f * frames.dim + k] * text[k];

    const similarity = dot / scale;

    if (!best || similarity > best.similarity) best = { at: frames.at[f], similarity };
  }

  return best;
}

export function signatureDistance(a: Int8Array, b: Int8Array): number {
  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];

    sum += d * d;
  }

  return Math.sqrt(sum) / 127;
}

export interface FrameSource {
  frames: Map<string, StoredFrames>;
  entry: (id: string) => Entry | null;
  ok: (entry: Entry) => boolean;
}

export function frameHits({ frames, entry: entryOf, ok }: FrameSource, text: Float32Array, wordHits: TryHit[]) {
  const out: TryHit[] = [];
  const worded = new Map<string, TryHit[]>();

  for (const hit of wordHits) worded.set(hit.tryId, [...(worded.get(hit.tryId) ?? []), hit]);

  const bests = [...frames].flatMap(([tryId, stored]) => {
    const entry = entryOf(tryId);
    const best = entry && ok(entry) ? bestFrame(stored, text) : null;

    return entry && best ? [{ tryId, entry, best }] : [];
  });
  const top = Math.max(-1, ...bests.map((b) => b.best.similarity));
  const floor = Math.max(FRAME_MIN, top - FRAME_NEAR);

  for (const { tryId, entry, best } of bests) {
    if (best.similarity < floor) continue;

    const same = worded.get(tryId) ?? [];

    for (const hit of same) hit.score *= 1 + best.similarity;

    if (!same.length) out.push({ ...hitOf(entry, best.similarity, 'frame'), at: best.at });
  }

  wordHits.sort(byScore);

  return out.sort(byScore);
}

export function likeHits(all: Array<Entry | null>, target: Entry, keep: (entry: Entry) => boolean, limit: number) {
  const hits: TryHit[] = [];

  for (const e of all) {
    if (!e?.signature || e === target || e.key !== target.key || !keep(e)) continue;

    hits.push(hitOf(e, 1 - signatureDistance(e.signature, target.signature!) / 2, 'motion'));
  }

  return hits.sort(byScore).slice(0, limit);
}
