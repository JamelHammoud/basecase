import { typeset } from '../../pages/typeset';
import { SYNONYMS } from './synonyms';

export interface SearchArticle {
  path: string;
  title: string;
  collection: string;
  type: string;
  summary: string;
  headings: string[];
  keywords: string[];
  text: string;
}

export interface SearchCollection {
  title: string;
  path: string;
}

export interface SearchData {
  articles: SearchArticle[];
  collections: SearchCollection[];
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export interface SearchResult {
  article: SearchArticle;
  score: number;
  snippet: Snippet | null;
}

interface Field {
  weight: number;
  words: Set<string>;
}

export interface PreparedArticle {
  article: SearchArticle;
  fields: Field[];
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'how',
  'do',
  'i',
  'my',
  'is',
]);
const PREFIX_FACTOR = 0.7;
const SYNONYM_FACTOR = 0.4;
const TITLE_BONUS = 6;
const DIRECT_BONUS = 1;
const RESULT_LIMIT = 8;
const SNIPPET_BEFORE = 50;
const SNIPPET_LENGTH = 150;

const stem = (word: string) =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

export const tokenize = (value: string) =>
  (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .match(/[a-z0-9⌘⇧⌥⌃]+/g) ?? []
  ).map(stem);

const SYNONYM_MAP = new Map<string, string[]>();

for (const group of SYNONYMS) {
  const words = group.flatMap(tokenize);

  words.forEach((word) =>
    SYNONYM_MAP.set(word, [...(SYNONYM_MAP.get(word) ?? []), ...words.filter((w) => w !== word)]),
  );
}

export const synonymsOf = (word: string) => [...new Set(SYNONYM_MAP.get(word) ?? [])];

const field = (weight: number, values: string[]): Field => ({ weight, words: new Set(values.flatMap(tokenize)) });

export const prepareArticles = (data: SearchData): PreparedArticle[] =>
  data.articles.map((article) => ({
    article,
    fields: [
      field(10, [article.title]),
      field(8, article.keywords),
      field(5, article.headings),
      field(3, [article.collection, article.summary]),
      field(1, [article.text]),
    ],
  }));

export function queryWords(query: string): string[] {
  const words = tokenize(query);
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));

  return meaningful.length > 0 ? meaningful : words;
}

function wordScore(word: string, words: Set<string>): number {
  if (words.has(word)) return 1;

  for (const candidate of words) {
    if (candidate.startsWith(word)) return PREFIX_FACTOR;
  }

  return 0;
}

function termScore(prepared: PreparedArticle, word: string): number {
  const synonyms = synonymsOf(word);
  let direct = 0;
  let viaSynonym = 0;

  for (const { weight, words } of prepared.fields) {
    direct = Math.max(direct, weight * wordScore(word, words));
    viaSynonym = synonyms.some((synonym) => words.has(synonym))
      ? Math.max(viaSynonym, weight * SYNONYM_FACTOR)
      : viaSynonym;
  }

  return Math.max(direct, viaSynonym) + (direct > 0 ? DIRECT_BONUS : 0);
}

const isWordStart = (text: string, index: number) => index === 0 || !/[a-z0-9]/i.test(text[index - 1]);

function firstMatch(text: string, words: string[]): { index: number; length: number } | null {
  const lower = text.toLowerCase();
  let found: { index: number; length: number } | null = null;

  for (const word of words) {
    let index = lower.indexOf(word);

    while (index >= 0 && !isWordStart(lower, index)) index = lower.indexOf(word, index + 1);

    const better: boolean = index >= 0 && (!found || index < found.index);

    found = better ? { index, length: word.length } : found;
  }

  return found;
}

export function snippetOf(text: string, words: string[]): Snippet | null {
  const found = firstMatch(text, words);

  if (!found) return null;

  const start = Math.max(0, found.index - SNIPPET_BEFORE);
  const from = start === 0 ? 0 : Math.min(found.index, text.indexOf(' ', start) + 1);
  const end = Math.min(text.length, from + SNIPPET_LENGTH);
  const matchEnd = found.index + found.length;

  return {
    before: `${from > 0 ? '…' : ''}${text.slice(from, found.index)}`,
    match: text.slice(found.index, matchEnd),
    after: `${text.slice(matchEnd, end)}${end < text.length ? '…' : ''}`,
  };
}

function scoreArticle(prepared: PreparedArticle, words: string[], query: string): number {
  let total = 0;

  for (const word of words) {
    const score = termScore(prepared, word);

    if (score === 0) return 0;

    total += score;
  }

  return total + (prepared.article.title.toLowerCase().includes(typeset(query.trim().toLowerCase())) ? TITLE_BONUS : 0);
}

export function searchArticles(prepared: PreparedArticle[], query: string, limit = RESULT_LIMIT): SearchResult[] {
  const words = queryWords(query);

  if (words.length === 0) return [];

  const highlight = [...words, ...words.flatMap(synonymsOf)];

  return prepared
    .map((entry) => ({ entry, score: scoreArticle(entry, words, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.article.title.localeCompare(b.entry.article.title))
    .slice(0, limit)
    .map(({ entry, score }) => ({ article: entry.article, score, snippet: snippetOf(entry.article.text, highlight) }));
}
