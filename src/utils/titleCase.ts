const MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'nor',
  'but',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'near',
  'of',
  'off',
  'on',
  'onto',
  'per',
  'to',
  'via',
  'with',
]);

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function casedPart(part: string, edge: boolean) {
  const lower = part.toLowerCase();

  return !edge && MINOR_WORDS.has(lower) ? lower : capitalized(part);
}

export function titleCase(text: string): string {
  const words = text.split(' ');
  const last = words.length - 1;

  return words
    .map((word, i) =>
      word
        .split('-')
        .map((part, j, parts) => casedPart(part, (i === 0 && j === 0) || (i === last && j === parts.length - 1)))
        .join('-'),
    )
    .join(' ');
}
