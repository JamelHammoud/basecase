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

export const termsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);

const round = (v: number) => Math.round(v * 1000) / 1000;

export function weightedTerms(fields: Array<{ text: string; boost: number }>): Array<[string, number]> {
  const weights = new Map<string, number>();

  for (const { text, boost } of fields) {
    const terms = termsOf(text);
    const counts = new Map<string, number>();

    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);

    for (const [term, count] of counts)
      weights.set(term, (weights.get(term) ?? 0) + (boost * (1 + Math.log(count))) / Math.sqrt(terms.length));
  }

  return [...weights].map(([term, weight]) => [term, round(weight)]);
}

const PREFIX_WEIGHT = 0.5;

export function wordWeight(terms: Array<[string, number]>, word: string, prefix: boolean): number {
  let best = 0;

  for (const [term, weight] of terms) {
    if (term === word) best = Math.max(best, weight);
    else if (prefix && term.startsWith(word)) best = Math.max(best, weight * PREFIX_WEIGHT);
  }

  return best;
}
