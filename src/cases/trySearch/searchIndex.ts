import type { StoredTry } from '../tryFile';
import { indexedTryOf } from './indexedTry';
import { hasFacts } from './queryParser';
import { stem, wordWeight } from './searchTerms';
import { signatureDistance } from './motion';
import { factFilter } from './tryFilter';
import {
  SIGNATURE_SCALE,
  type HitMatch,
  type IndexedTry,
  type ParsedQuery,
  type QueryFilters,
  type QueryVocab,
  type TryHit,
} from './types';

const FORMAT = 'basecase-try-index';

export const INDEX_VERSION = 2;

interface Saved {
  format: string;
  version: number;
  tries: IndexedTry[];
}

const hitOf = (e: IndexedTry, score: number, match: HitMatch): TryHit => ({
  tryId: e.id,
  label: e.label,
  robot: e.robot,
  sceneId: e.sceneId,
  score,
  match,
  verdict: e.verdict,
  seconds: e.seconds,
  startedAt: e.startedAt,
});

const newestFirst = (a: TryHit, b: TryHit) => b.startedAt.localeCompare(a.startedAt);

const byScore = (a: TryHit, b: TryHit) => b.score - a.score || newestFirst(a, b);

const isSaved = (value: unknown): value is Saved =>
  typeof value === 'object' &&
  value !== null &&
  (value as Saved).format === FORMAT &&
  (value as Saved).version === INDEX_VERSION &&
  Array.isArray((value as Saved).tries);

const isEntry = (e: IndexedTry) =>
  typeof e?.id === 'string' && Array.isArray(e.terms) && Array.isArray(e.named) && typeof e.startedAt === 'string';

function merged(first: TryHit[], second: TryHit[], limit: number): TryHit[] {
  const best = new Map<string, TryHit>();

  for (const hit of [...first, ...second]) {
    const held = best.get(hit.tryId);

    if (!held || hit.score > held.score) best.set(hit.tryId, hit);
  }

  return [...best.values()].sort(byScore).slice(0, limit);
}

export class TrySearchIndex {
  private tries = new Map<string, IndexedTry>();
  private words: QueryVocab | null = null;

  static fromSnapshot(bytes: Uint8Array): TrySearchIndex | null {
    try {
      const saved: unknown = JSON.parse(new TextDecoder().decode(bytes));

      if (!isSaved(saved)) return null;

      const index = new TrySearchIndex();

      for (const entry of saved.tries.filter(isEntry)) index.tries.set(entry.id, entry);

      return index;
    } catch {
      return null;
    }
  }

  snapshot(): Uint8Array {
    const saved: Saved = { format: FORMAT, version: INDEX_VERSION, tries: [...this.tries.values()] };

    return new TextEncoder().encode(JSON.stringify(saved));
  }

  put(tries: StoredTry[], stamps: Record<string, number> = {}) {
    for (const stored of tries) this.tries.set(stored.id, indexedTryOf(stored, stamps[stored.id] ?? 0));

    this.words = null;
  }

  remove(ids: string[]) {
    for (const id of ids) this.tries.delete(id);

    this.words = null;
  }

  stamps(): Record<string, number> {
    return Object.fromEntries([...this.tries.values()].map((t) => [t.id, t.stamp]));
  }

  ids(): string[] {
    return [...this.tries.keys()];
  }

  vocab(): QueryVocab {
    this.words ??= this.freshVocab();

    return this.words;
  }

  private freshVocab(): QueryVocab {
    const all = [...this.tries.values()];

    return {
      robots: [...new Set(all.map((t) => t.robot).filter(Boolean))],
      inputs: [...new Set(all.flatMap((t) => (t.input ? [t.input] : [])))],
      named: [...new Set(all.flatMap((t) => t.named))],
    };
  }

  search(query: ParsedQuery, limit: number): TryHit[] {
    const hits = this.searchOne(query, limit);

    return query.alternate ? merged(hits, this.searchOne(query.alternate, limit), limit) : hits;
  }

  private searchOne({ words, filters }: ParsedQuery, limit: number): TryHit[] {
    if (filters.like) return this.like(words, filters, limit);

    if (words.length) return this.wordHits(words, filters).slice(0, limit);

    return hasFacts(filters) ? this.factHits(filters).slice(0, limit) : [];
  }

  private wordHits(words: string[], filters: QueryFilters): TryHit[] {
    const stems = words.map(stem);
    const found = new Array<number>(stems.length).fill(0);
    const ok = factFilter(filters);
    const matched: Array<{ entry: IndexedTry; weights: number[] }> = [];

    for (const entry of this.tries.values()) {
      const weights = stems.map((word, i) => wordWeight(entry.terms, word, i === stems.length - 1));

      weights.forEach((w, i) => (found[i] += w > 0 ? 1 : 0));

      if (weights.every((w) => w > 0) && ok(entry)) matched.push({ entry, weights });
    }

    const rarity = found.map((count) => Math.log(1 + this.tries.size / Math.max(1, count)));

    return matched
      .map(({ entry, weights }) =>
        hitOf(
          entry,
          weights.reduce((sum, w, i) => sum + w * rarity[i], 0),
          'words',
        ),
      )
      .sort(byScore);
  }

  private factHits(filters: QueryFilters): TryHit[] {
    const ok = factFilter(filters);

    return [...this.tries.values()]
      .filter(ok)
      .map((e) => hitOf(e, 0, 'facts'))
      .sort(newestFirst);
  }

  private like(words: string[], filters: QueryFilters, limit: number): TryHit[] {
    const target = this.tries.get(filters.like!);
    const signature = target?.signature;

    if (!target || !signature) return [];

    const allowed = words.length ? new Set(this.wordHits(words, { ...filters, like: null }).map((h) => h.tryId)) : null;
    const ok = factFilter(filters);
    const hits: TryHit[] = [];

    for (const e of this.tries.values()) {
      if (!e.signature || e === target || e.motionKey !== target.motionKey || !ok(e)) continue;

      if (!allowed || allowed.has(e.id))
        hits.push(hitOf(e, 1 - signatureDistance(e.signature, signature, SIGNATURE_SCALE) / 2, 'motion'));
    }

    return hits.sort(byScore).slice(0, limit);
  }
}
