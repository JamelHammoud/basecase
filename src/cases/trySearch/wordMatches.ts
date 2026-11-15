import { wordWeight } from './searchTerms';
import type { IndexedTry } from './types';

interface WordMatch {
  weights: number[];
  range: { from?: number; to?: number };
}

export function wordMatches(entry: IndexedTry, stems: string[]) {
  const weigh = (terms: IndexedTry['terms']) => stems.map((word, i) => wordWeight(terms, word, i === stems.length - 1));
  const common = weigh(entry.terms);
  const segments = entry.segments.map((segment) => {
    const local = weigh(segment.terms);

    return {
      range: { from: segment.from, to: segment.to },
      weights: local.map((weight, i) => Math.max(common[i], weight)),
      contributed: local.some((weight) => weight > 0),
    };
  });
  const exact = segments.filter((segment) => segment.contributed && segment.weights.every((weight) => weight > 0));
  const matches: WordMatch[] = exact.length ? exact : [{ weights: common, range: {} }];

  return {
    found: common.map((weight, i) => weight > 0 || segments.some((segment) => segment.weights[i] > 0)),
    matches: matches.filter((match) => match.weights.every((weight) => weight > 0)),
  };
}
