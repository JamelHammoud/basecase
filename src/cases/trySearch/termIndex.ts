import { stem } from './searchDocs';

export type Boosts = Record<string, number>;

interface Posting {
  slots: number[];
  weights: number[];
}

export interface SavedTerms {
  keys: number[];
  terms: Array<[term: string, slots: number[], weights: number[]]>;
}

export interface WordHits {
  scores: Float32Array;
  touched: number[];
}

const PREFIX_WEIGHT = 0.5;

export const termsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);

const round = (v: number) => Math.round(v * 1000) / 1000;

function lowerBound(sorted: string[], value: string): number {
  let low = 0;
  let high = sorted.length;

  while (low < high) {
    const mid = (low + high) >> 1;

    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }

  return low;
}

function fieldWeights(fields: Record<string, string>, boosts: Boosts): Map<string, number> {
  const weights = new Map<string, number>();

  for (const [field, text] of Object.entries(fields)) {
    const terms = termsOf(text);
    const counts = new Map<string, number>();

    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);

    for (const [term, count] of counts) {
      const weight = ((boosts[field] ?? 1) * (1 + Math.log(count))) / Math.sqrt(terms.length);

      weights.set(term, (weights.get(term) ?? 0) + weight);
    }
  }

  return weights;
}

export class TermIndex {
  private keys: number[] = [];

  private slotOf = new Map<number, number>();

  private postings = new Map<string, Posting>();

  private sorted: string[] | null = null;

  private readonly boosts: Boosts;

  constructor(boosts: Boosts, saved?: SavedTerms) {
    this.boosts = boosts;

    if (!saved) return;

    this.keys = saved.keys;
    saved.keys.forEach((key, slot) => this.slotOf.set(key, slot));
    this.postings = new Map(saved.terms.map(([term, slots, weights]) => [term, { slots, weights }]));
  }

  get size() {
    return this.slotOf.size;
  }

  add(key: number, fields: Record<string, string>) {
    this.remove(key);

    const slot = this.keys.push(key) - 1;

    this.slotOf.set(key, slot);

    for (const [term, weight] of fieldWeights(fields, this.boosts)) this.post(term, slot, weight);
  }

  remove(key: number) {
    const slot = this.slotOf.get(key);

    if (slot === undefined) return;

    this.keys[slot] = -1;
    this.slotOf.delete(key);
  }

  search(word: string, prefix: boolean, into: WordHits) {
    const [term] = termsOf(word);

    if (!term) return;

    for (const [found, posting] of this.matching(term, prefix)) {
      const scale = Math.log(1 + this.slotOf.size / posting.slots.length) * (found === term ? 1 : PREFIX_WEIGHT);

      for (let i = 0; i < posting.slots.length; i++) {
        const key = this.keys[posting.slots[i]];
        const score = posting.weights[i] * scale;

        if (key < 0 || into.scores[key] >= score) continue;

        if (!into.scores[key]) into.touched.push(key);

        into.scores[key] = score;
      }
    }
  }

  saved(remap: (key: number) => number | undefined): SavedTerms {
    const moved = new Map<number, number>();
    const keys: number[] = [];

    this.keys.forEach((key, slot) => {
      const to = key < 0 ? undefined : remap(key);

      if (to === undefined) return;

      moved.set(slot, keys.length);
      keys.push(to);
    });

    const terms: SavedTerms['terms'] = [];

    for (const [term, posting] of this.postings) {
      const slots: number[] = [];
      const weights: number[] = [];

      posting.slots.forEach((slot, i) => {
        const to = moved.get(slot);

        if (to === undefined) return;

        slots.push(to);
        weights.push(round(posting.weights[i]));
      });

      if (slots.length) terms.push([term, slots, weights]);
    }

    return { keys, terms };
  }

  private post(term: string, slot: number, weight: number) {
    const posting = this.postings.get(term);

    if (posting) {
      posting.slots.push(slot);
      posting.weights.push(weight);

      return;
    }

    this.postings.set(term, { slots: [slot], weights: [weight] });
    this.sorted = null;
  }

  private *matching(term: string, prefix: boolean): Generator<[string, Posting]> {
    const exact = this.postings.get(term);

    if (!prefix && exact) yield [term, exact];

    if (!prefix) return;

    this.sorted ??= [...this.postings.keys()].sort();

    for (let i = lowerBound(this.sorted, term); i < this.sorted.length && this.sorted[i].startsWith(term); i++) {
      yield [this.sorted[i], this.postings.get(this.sorted[i])!];
    }
  }
}
