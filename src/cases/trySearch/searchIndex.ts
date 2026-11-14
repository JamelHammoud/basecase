import type { StoredTry } from '../tryFile';
import { readIndexSnapshot, writeIndexSnapshot, type IndexState } from './indexSnapshot';
import { hasFacts } from './queryParser';
import { SEGMENT_BOOSTS, TRY_BOOSTS, docsOf, entryId, quantized, type Entry } from './searchDocs';
import { FRAME_MIN, factFilter, frameHits, hitOf, likeHits, newestFirst, type StoredFrames } from './searchHits';
import { TermIndex } from './termIndex';
import type { FrameVector, ParsedQuery, QueryFilters, QueryVocab, TryHit } from './types';
import { candidateSlots, segmentScore, topScored, tryScore, wordScores, type Scored } from './wordMatch';

export { FRAME_MIN };

export interface SearchOptions {
  limit: number;
  textVector?: Float32Array | null;
}

const emptyState = (): IndexState => ({
  text: { tries: new TermIndex(TRY_BOOSTS), segments: new TermIndex(SEGMENT_BOOSTS) },
  entryAt: [],
  slotOf: new Map(),
  tries: new Map(),
  frames: new Map(),
});

export class TrySearchIndex {
  private state: IndexState;

  private dead = 0;

  constructor(state?: IndexState) {
    this.state = state ?? emptyState();
  }

  static fromSnapshot(bytes: Uint8Array): TrySearchIndex | null {
    try {
      const state = readIndexSnapshot(bytes);

      return state && new TrySearchIndex(state);
    } catch {
      return null;
    }
  }

  snapshot(): Uint8Array {
    return writeIndexSnapshot(this.state);
  }

  put(tries: StoredTry[], stamps: Record<string, number> = {}) {
    const { text, entryAt, slotOf } = this.state;

    for (const stored of tries) {
      this.drop(stored.id);

      const made = docsOf(stored);
      const parent = entryAt.length;
      const slots = made.entries.map((facts, i) => {
        entryAt.push({ ...facts, slot: parent + i, parent });
        slotOf.set(facts.id, parent + i);

        return parent + i;
      });

      text.tries.add(parent, made.tryDoc);
      made.segmentDocs.forEach((doc, i) => text.segments.add(slots[i + 1], { own: doc.own }));
      this.state.tries.set(stored.id, {
        slot: parent,
        segments: slots.slice(1),
        stamp: stamps[stored.id] ?? 0,
        robot: stored.robot.name,
        input: stored.input,
      });
    }

    this.compactWhenSparse();
  }

  remove(ids: string[]) {
    for (const id of ids) {
      this.drop(id);
      this.state.frames.delete(id);
    }

    this.compactWhenSparse();
  }

  stamps(): Record<string, number> {
    return Object.fromEntries([...this.state.tries].map(([id, t]) => [id, t.stamp]));
  }

  ids(): string[] {
    return [...this.state.tries.keys()];
  }

  vocab(): QueryVocab {
    const all = [...this.state.tries.values()];

    return {
      robots: [...new Set(all.map((t) => t.robot).filter(Boolean))],
      inputs: [...new Set(all.flatMap((t) => (t.input ? [t.input] : [])))],
    };
  }

  putFrames(tryId: string, frames: FrameVector[]) {
    const dim = frames[0]?.vector.length ?? 0;

    if (!this.state.tries.has(tryId) || !dim) return;

    const vectors = new Int8Array(frames.length * dim);

    frames.forEach((f, i) => vectors.set(quantized(f.vector), i * dim));
    this.state.frames.set(tryId, { at: frames.map((f) => f.at), dim, vectors } satisfies StoredFrames);
  }

  hasFrames(tryId: string): boolean {
    return this.state.frames.has(tryId);
  }

  search({ words, filters }: ParsedQuery, options: SearchOptions): TryHit[] {
    if (filters.like) return this.like(words, filters, options.limit);

    if (words.length) return this.wordHits(words, filters, options);

    return hasFacts(filters) ? this.factHits(filters, options.limit) : [];
  }

  private entry(id: string): Entry | null {
    const slot = this.state.slotOf.get(id);

    return slot === undefined ? null : this.state.entryAt[slot];
  }

  private drop(tryId: string) {
    const known = this.state.tries.get(tryId);

    if (!known) return;

    for (const slot of [known.slot, ...known.segments]) {
      const entry = this.state.entryAt[slot];

      if (entry) this.state.slotOf.delete(entry.id);

      this.state.entryAt[slot] = null;
      this.dead++;
    }

    this.state.text.tries.remove(known.slot);

    for (const slot of known.segments) this.state.text.segments.remove(slot);

    this.state.tries.delete(tryId);
  }

  private compactWhenSparse() {
    if (this.dead < 10_000 || this.dead < this.state.slotOf.size) return;

    this.state = readIndexSnapshot(writeIndexSnapshot(this.state))!;
    this.dead = 0;
  }

  private readonly segmentsOf = (trySlot: number) => {
    const entry = this.state.entryAt[trySlot];

    return (entry && this.state.tries.get(entry.tryId)?.segments) || [];
  };

  private scored(words: string[], ok: (entry: Entry) => boolean): Scored[] {
    const { entryAt, text } = this.state;
    const scores = wordScores(text, words, entryAt.length);
    const found: Scored[] = [];

    for (const slot of candidateSlots(scores, this.segmentsOf)) {
      const entry = entryAt[slot];
      const score = entry && ok(entry) && (entry.segmentId ? segmentScore(scores, entry) : tryScore(scores, slot));

      if (entry && score) found.push({ entry, score });
    }

    return found;
  }

  private wordHits(words: string[], filters: QueryFilters, { limit, textVector }: SearchOptions): TryHit[] {
    const ok = factFilter(filters);
    const hits = topScored(this.scored(words, ok), limit).map(({ entry, score }) => hitOf(entry, score, 'words'));
    const frames = textVector
      ? frameHits({ frames: this.state.frames, entry: (id) => this.entry(id), ok }, textVector, hits)
      : [];

    return [...hits, ...frames].slice(0, limit);
  }

  private factHits(filters: QueryFilters, limit: number): TryHit[] {
    const ok = factFilter(filters);
    const hits: TryHit[] = [];

    for (const entry of this.state.entryAt)
      if (entry && !entry.segmentId && ok(entry)) hits.push(hitOf(entry, 0, 'facts'));

    return hits.sort(newestFirst).slice(0, limit);
  }

  private like(words: string[], filters: QueryFilters, limit: number): TryHit[] {
    const target = this.entry(entryId(filters.like!.tryId, filters.like!.segmentId));

    if (!target?.signature) return [];

    const allowed = words.length ? new Set(this.scored(words, () => true).map((s) => s.entry.slot)) : null;
    const ok = factFilter(filters);

    return likeHits(this.state.entryAt, target, (e) => ok(e) && (!allowed || allowed.has(e.slot)), limit);
  }
}
