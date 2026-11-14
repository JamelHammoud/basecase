import type { TrySource, TryVerdict } from '../tryFile';
import { DATE_PATTERN, dateSpan } from './queryDates';
import type { LikeTarget, ParsedQuery, QueryFilters, QueryVocab } from './types';

export const KNOWN_INPUTS = [
  'camera',
  'phone',
  'midi',
  'leader-arm',
  'voice',
  'policy',
  'script',
  'gamepad',
  'keys',
  'mat',
  'code',
];

const VERDICT_WORDS: Record<string, TryVerdict> = {
  passed: 'passed',
  pass: 'passed',
  passes: 'passed',
  failed: 'failed',
  fail: 'failed',
  fails: 'failed',
  missed: 'failed',
  unjudged: 'unjudged',
};

const SOURCE_WORDS: Record<string, TrySource> = {
  case: 'case',
  variation: 'generated',
  variations: 'generated',
  generated: 'generated',
  real: 'real',
};

const FAULT_WORDS = new Set(['faulted', 'fault', 'faults']);

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'on',
  'of',
  'from',
  'with',
  'in',
  'at',
  'to',
  'by',
  'for',
  'and',
  'or',
  'that',
  'which',
  'where',
  'try',
  'tries',
]);

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600 };

const DURATION =
  /\b(over|under|longer than|shorter than|more than|less than|at least|at most)\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b/g;

const LIKE = /(?:^|\s)like:([\w-]{1,128})(?:\/([\w-]{1,128}))?(?=\s|$)/;

const MINIMUM = new Set(['over', 'longer than', 'more than', 'at least']);

const INCLUSIVE = new Set(['at least', 'at most']);

const emptyFilters = (): QueryFilters => ({
  verdicts: [],
  sources: [],
  inputs: [],
  robots: [],
  after: null,
  before: null,
  minSeconds: null,
  maxSeconds: null,
  faulted: null,
  like: null,
});

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const phrasePattern = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${name
      .split(/[-_\s]+/)
      .map(escaped)
      .join('[-_\\s]+')}(?![\\p{L}\\p{N}])`,
    'u',
  );

const addOnce = <T>(list: T[], value: T) => {
  if (!list.includes(value)) list.push(value);
};

function takeLike(text: string, filters: QueryFilters): string {
  const like = LIKE.exec(text);

  if (!like) return text;

  const target: LikeTarget = { tryId: like[1], segmentId: like[2] ?? null };

  filters.like = target;

  return text.replace(like[0], ' ');
}

function takeDurations(text: string, filters: QueryFilters): string {
  return text.replace(DURATION, (_, how: string, amount: string, unit: string) => {
    const bound = { value: Number(amount) * UNITS[unit[0]], inclusive: INCLUSIVE.has(how) };

    if (MINIMUM.has(how)) filters.minSeconds = bound;
    else filters.maxSeconds = bound;

    return ' ';
  });
}

function takeDates(text: string, filters: QueryFilters, now: Date): string {
  return text.replace(DATE_PATTERN, (phrase) => {
    const span = dateSpan(phrase, now);

    filters.after = span?.after ?? filters.after;
    filters.before = span?.before ?? filters.before;

    return ' ';
  });
}

interface Name {
  value: string;
  list: 'robots' | 'inputs';
}

function takeNames(text: string, filters: QueryFilters, vocab: QueryVocab): string {
  const names: Name[] = [
    ...vocab.robots.map((value) => ({ value, list: 'robots' as const })),
    ...[...new Set([...vocab.inputs, ...KNOWN_INPUTS])].map((value) => ({ value, list: 'inputs' as const })),
  ].sort((a, b) => b.value.length - a.value.length);
  let rest = text;

  for (const name of names) {
    const pattern = phrasePattern(name.value.toLowerCase());

    if (!name.value.trim() || !pattern.test(rest)) continue;

    addOnce<string>(filters[name.list], name.value);
    rest = rest.replace(pattern, ' ');
  }

  return rest;
}

function readWord(word: string, filters: QueryFilters, words: string[]) {
  if (VERDICT_WORDS[word]) addOnce(filters.verdicts, VERDICT_WORDS[word]);
  else if (SOURCE_WORDS[word]) addOnce(filters.sources, SOURCE_WORDS[word]);
  else if (FAULT_WORDS.has(word)) filters.faulted = true;
  else if (!STOP_WORDS.has(word)) addOnce(words, word);
}

export function parseQuery(text: string, vocab: QueryVocab, now: Date): ParsedQuery {
  const filters = emptyFilters();
  const words: string[] = [];
  const lowered = takeLike(` ${text} `, filters).toLowerCase();
  const rest = takeNames(takeDates(takeDurations(lowered, filters), filters, now), filters, vocab);

  for (const word of rest.split(/[^\p{L}\p{N}]+/u)) if (word) readWord(word, filters, words);

  return { words, filters };
}

export const hasFacts = (f: QueryFilters) =>
  f.verdicts.length > 0 ||
  f.sources.length > 0 ||
  f.inputs.length > 0 ||
  f.robots.length > 0 ||
  f.after !== null ||
  f.before !== null ||
  f.minSeconds !== null ||
  f.maxSeconds !== null ||
  f.faulted !== null;
