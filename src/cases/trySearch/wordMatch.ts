import type { Entry } from './searchDocs';
import type { TermIndex, WordHits } from './termIndex';

export interface TextIndexes {
  tries: TermIndex;
  segments: TermIndex;
}

export interface WordScores {
  tries: WordHits;
  segments: WordHits;
}

const SEGMENT_TRY_WEIGHT = 0.5;

const hitsFor = (size: number): WordHits => ({ scores: new Float32Array(size), touched: [] });

export function wordScores(text: TextIndexes, words: string[], size: number): WordScores[] {
  return words.map((word, i) => {
    const prefix = i === words.length - 1;
    const scores = { tries: hitsFor(size), segments: hitsFor(size) };

    text.tries.search(word, prefix, scores.tries);
    text.segments.search(word, prefix, scores.segments);

    return scores;
  });
}

export function tryScore(scores: WordScores[], slot: number): number {
  let total = 0;

  for (const word of scores) {
    const score = word.tries.scores[slot];

    if (!score) return 0;

    total += score;
  }

  return total;
}

export function segmentScore(scores: WordScores[], entry: Entry): number {
  let total = 0;
  let own = false;

  for (const word of scores) {
    const mine = word.segments.scores[entry.slot];
    const parent = word.tries.scores[entry.parent];

    if (!mine && !parent) return 0;

    own ||= mine > 0;
    total += mine || parent * SEGMENT_TRY_WEIGHT;
  }

  return own ? total : 0;
}

const smallest = <T>(items: T[], size: (item: T) => number) =>
  items.reduce((best, item) => (size(item) < size(best) ? item : best));

export function candidateSlots(scores: WordScores[], segmentsOf: (trySlot: number) => number[]): number[] {
  if (!scores.length) return [];

  const tries = smallest(scores, (w) => w.tries.touched.length).tries.touched;
  const coverage = (w: WordScores) =>
    w.segments.touched.length + w.tries.touched.reduce((n, slot) => n + segmentsOf(slot).length, 0);
  const narrowest = smallest(scores, coverage);
  const seen = new Set<number>(narrowest.segments.touched);
  const segments = [...narrowest.segments.touched];

  for (const trySlot of narrowest.tries.touched) {
    for (const slot of segmentsOf(trySlot)) {
      if (seen.has(slot)) continue;

      seen.add(slot);
      segments.push(slot);
    }
  }

  return [...tries, ...segments];
}

export interface Scored {
  entry: Entry;
  score: number;
}

const better = (a: Scored, b: Scored) => b.score - a.score || b.entry.startedAt.localeCompare(a.entry.startedAt);

export function topScored(found: Scored[], limit: number): Scored[] {
  if (found.length <= limit) return found.sort(better);

  let floor = -Infinity;
  let kept: Scored[] = [];

  for (const item of found) {
    if (item.score < floor) continue;

    kept.push(item);

    if (kept.length < limit * 2) continue;

    kept = kept.sort(better).slice(0, limit);
    floor = kept[kept.length - 1].score;
  }

  return kept.sort(better).slice(0, limit);
}
