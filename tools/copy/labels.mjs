import { SLOT } from './extract.mjs';
import { glossaryWord } from './glossary.mjs';

const FENCE = /^\s*(```|~~~)/;
const VERBS = [
  'double-click',
  'right-click',
  'click',
  'choose',
  'press',
  'pick',
  'open',
  'run',
  'turn on',
  'turn off',
  'switch on',
  'switch off',
  'select',
  'tap',
];
const BOLD = String.raw`\*\*[^*]+\*\*`;
const JOIN = String.raw`(?:,\s*|,?\s+(?:or|and|then)\s+|\s*▸\s*)`;
const PLAIN = String.raw`[A-Z0-9+][\w&'’+-]*(?: [A-Z0-9&][\w&'’+-]*)*`;
const SEGMENT = `(?:${BOLD}|${PLAIN})`;
const VERB_LABELS = new RegExp(String.raw`\b(?:${VERBS.join('|')})\s+(?:the\s+)?(${BOLD}(?:${JOIN}${BOLD})*)`, 'gi');
const MENU_PATH = new RegExp(String.raw`${SEGMENT}(?:\s*▸\s*${SEGMENT})+`, 'g');
const BOLD_SPAN = /\*\*([^*]+)\*\*/g;
const KEY_CAP = /\[\[([^[\]]+)\]\]/g;
const MODIFIERS = '⌃⌥⇧⌘';
const MAX_LABEL_WORDS = 6;

const readable = (line) =>
  line
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(KEY_CAP, '');

const fold = (text) => text.replaceAll('’', "'");

const clean = (label) =>
  fold(label)
    .replace(/⟨[^⟩]*⟩/g, SLOT)
    .replace(/\s+/g, ' ')
    .replace(/(?:\.\.\.|[.…:,])+$/, '')
    .trim();

const LEAD_WORDS = new RegExp(
  String.raw`^(?:(?:${VERBS.join('|')}|in|under|from|on|the|then|or|and|use|see)\s+)+`,
  'i',
);

const boldSegments = (label) => label.split('▸').map(clean);

const pathSegment = (segment) =>
  segment.includes('**') ? clean(segment.replaceAll('**', '')) : clean(segment).replace(LEAD_WORDS, '');

const boldIn = (text) => [...text.matchAll(BOLD_SPAN)].map(([, label]) => label);

function lineLabels(text) {
  const chained = [...text.matchAll(VERB_LABELS)].flatMap((match) => boldIn(match[1]).flatMap(boldSegments));
  const paths = [...text.matchAll(MENU_PATH)].flatMap(([path]) => path.split('▸').map(pathSegment));
  const boldPaths = boldIn(text).filter((label) => label.includes('▸'));

  return [...chained, ...paths, ...boldPaths.flatMap(boldSegments)].filter(Boolean);
}

const keysIn = (line) => [...line.replace(/`[^`]*`/g, '').matchAll(KEY_CAP)].map(([, cap]) => cap.trim());

function bodyLines(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const start = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  let fenced = false;

  return lines.flatMap((text, index) => {
    const fence = FENCE.test(text);

    if (fence) fenced = !fenced;

    return index < start || fence || fenced ? [] : [{ text, line: index + 1 }];
  });
}

export function labelsInArticle(source) {
  const seen = new Set();

  return bodyLines(source)
    .flatMap(({ text, line }) => [
      ...lineLabels(readable(text)).map((label) => ({ kind: 'label', text: label, line })),
      ...keysIn(text).map((cap) => ({ kind: 'key', text: cap, line })),
    ])
    .filter(({ kind, text, line }) => {
      const id = `${kind}\n${text}\n${line}`;

      if (seen.has(id)) return false;

      seen.add(id);

      return true;
    });
}

export function chordKey(cap) {
  const compact = cap.replace(/\s+/g, '');
  let at = 0;

  while (at < compact.length - 1 && MODIFIERS.includes(compact[at])) at += 1;

  const held = [...MODIFIERS].filter((glyph) => compact.slice(0, at).includes(glyph)).join('');

  return { held, key: compact.slice(at) };
}

const isCombination = (cap) => {
  const { held, key } = chordKey(cap);

  return held !== '' && key !== '' && ![...key].every((glyph) => MODIFIERS.includes(glyph));
};

const chordId = (cap) => {
  const { held, key } = chordKey(cap);

  return `${held}${key}`;
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const templatePattern = (template) => new RegExp(`^${template.split(SLOT).map(escape).join('.{1,40}?')}$`);

const isTemplate = (text) => text.includes(SLOT) && text.replaceAll(SLOT, '').trim().length >= 3;

const isLabelLike = (text) =>
  text.length <= 40 && text.split(' ').length <= MAX_LABEL_WORDS && /^[\p{Lu}\d+⌘]/u.test(text);

export function labelIndex({ strings, keys = [], exceptions = [] }) {
  const unique = [...new Set(strings.map(fold))];

  return {
    labels: new Set(unique),
    templates: unique.filter(isTemplate).map(templatePattern),
    names: unique.filter(isLabelLike),
    keys: new Set(keys.map(chordId)),
    exceptions: new Set(exceptions.map(({ label }) => label)),
  };
}

export const hasLabel = (index, text) =>
  index.labels.has(text) || index.exceptions.has(text) || index.templates.some((pattern) => pattern.test(text));

export const hasKey = (index, cap) => !isCombination(cap) || index.keys.has(chordId(cap)) || index.exceptions.has(cap);

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      row.push(Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost));
    }

    previous = row;
  }

  return previous[b.length];
}

function glossaryLabel(index, text) {
  const word = glossaryWord(text);
  const space = text.indexOf(' ');
  const renamed = word && space > 0 ? `${word}${text.slice(space)}` : word;

  return renamed && hasLabel(index, renamed) ? renamed : null;
}

const wordsOf = (text) => new Set(text.toLowerCase().split(/\s+/));

function rank(text) {
  const lower = text.toLowerCase();
  const words = wordsOf(text);

  return (name) => ({
    name,
    apart: [...wordsOf(name)].some((word) => words.has(word)) ? 0 : 1,
    cost: distance(lower, name.toLowerCase()),
  });
}

export function closestLabel(index, text) {
  const [best] = index.names.map(rank(text)).sort((a, b) => a.apart - b.apart || a.cost - b.cost);

  return glossaryLabel(index, text) ?? best?.name ?? null;
}

function problemFor(index, { kind, text, line }) {
  if (kind === 'key') return { line, message: `[[${text}]] isn't a shortcut in electron/shortcuts.json (§3f)` };

  const closest = closestLabel(index, text);
  const hint = closest ? `; the closest is “${closest}”` : '';

  return { line, message: `**${text}** names no label in the app${hint} (§3f)` };
}

export const missingLabels = (source, index) =>
  labelsInArticle(source)
    .filter(({ kind, text }) => (kind === 'key' ? !hasKey(index, text) : !hasLabel(index, text)))
    .map((found) => problemFor(index, found));
