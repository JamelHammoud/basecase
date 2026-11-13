const FILLER = new Set(
  'the and with from for into its their this that each every one any all a an as at by of on in to or so when you your they them our'.split(
    ' ',
  ),
);
const KIND_WORDS = new Set([
  'feature',
  'integration',
  'refine',
  'fix',
  'repair',
  'lesson',
  'loop',
  'update',
  'market',
  'harness',
]);

const stem = (word) => {
  if (/\d/.test(word)) return word;

  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;

  const unsuffixed = word.replace(/(ing|ed)$/, '');

  if (unsuffixed !== word) return unsuffixed.replace(/([^aeioudflsz])\1$/, '$1');

  return word.endsWith('ss') ? word : word.replace(/s$/, '');
};

const titleWords = (title) =>
  new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => /\d/.test(word) || (word.length >= 3 && !FILLER.has(word) && !KIND_WORDS.has(word)))
      .map(stem),
  );

export const similarTitle = (a, b) => {
  const [x, y] = [titleWords(a), titleWords(b)];

  return x.size >= 3 && x.size === y.size && [...x].every((word) => y.has(word));
};

export const sameTitle = (a, b) => {
  const norm = (t) =>
    t
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.\s]+$/, '')
      .trim();

  return norm(a) === norm(b);
};

export const openMatch = (title, open, similarAmong = []) =>
  open.find(
    (issue) =>
      sameTitle(issue.title, title) ||
      (issue.labels.some((label) => similarAmong.includes(label)) && similarTitle(issue.title, title)),
  ) ?? null;
