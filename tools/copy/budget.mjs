import { normalize } from './extract.mjs';

const SOURCE = /^src\/.+\.tsx?$/;
const SKIPPED = [/\.d\.ts$/, /\.(test|spec|e2e)\.tsx?$/, /(^|\/)__tests__\//, /^src\/data\//, /(^|\/)fixtures?\//];

export const isScanned = (file) => SOURCE.test(file) && !SKIPPED.some((pattern) => pattern.test(file));

function counts(list) {
  const map = new Map();

  for (const { text } of list) map.set(text, (map.get(text) ?? 0) + 1);

  return map;
}

function surplus(list, other) {
  const left = counts(other);

  return list.filter(({ text }) => {
    const remaining = left.get(text) ?? 0;

    left.set(text, remaining - 1);

    return remaining <= 0;
  });
}

export function diffStrings(base, head) {
  const before = new Set(base.map(({ text }) => text));
  const added = surplus(head, base).map((item) => ({ ...item, repeat: before.has(item.text) }));

  return { added, removed: surplus(base, head) };
}

const LINE = /^\s*(?:[-*]\s+)?copy:\s*["“](.*)["”]\s*[—–-]+\s*(\S.*)$/i;

export function parseJustifications(body = '') {
  const reasons = new Map();

  for (const line of body.split(/\r?\n/)) {
    const match = LINE.exec(line);

    if (match) reasons.set(normalize(match[1]), match[2].trim());
  }

  return reasons;
}

export const compileBanned = (banned) => banned.map(([source, flags]) => new RegExp(source, flags));

export const bannedIn = (text, patterns) => patterns.filter((pattern) => pattern.test(text)).map(String);

export function judge({ added, removed, body, banned }) {
  const reasons = parseJustifications(body);
  const patterns = compileBanned(banned);
  const net = added.length - removed.length;
  const items = added.map((item) => ({
    ...item,
    why: reasons.get(item.text) ?? null,
    banned: bannedIn(item.text, patterns),
  }));
  const unjustified = net > 0 ? items.filter((item) => !item.why && !item.repeat) : [];
  const banning = items.filter((item) => item.banned.length > 0);

  return { net, items, unjustified, banning, ok: unjustified.length === 0 && banning.length === 0 };
}

const where = (item) => `${item.file}:${item.line}`;

function itemLine(item) {
  const notes = [
    item.why ? `why: ${item.why}` : null,
    item.repeat && !item.why ? 'repeats a string the file already has' : null,
    item.banned.length > 0 ? `banned ${item.banned.join(', ')}` : null,
  ].filter(Boolean);

  return `  + "${item.text}"  ${where(item)}${notes.length > 0 ? `  (${notes.join('; ')})` : ''}`;
}

function failureLines(verdict) {
  const lines = [];

  if (verdict.unjustified.length > 0) {
    lines.push(
      '',
      `This change adds ${verdict.net} more string${verdict.net === 1 ? '' : 's'} than it removes. Cut each new one the screen can do without (§3d), or justify it in the pull request body's Copy section:`,
      ...verdict.unjustified.map((item) => `  copy: "${item.text}" — <why the screen needs it>`),
    );
  }

  if (verdict.banning.length > 0) {
    lines.push(
      '',
      'These strings use words §3c bans:',
      ...verdict.banning.map((item) => `  "${item.text}"  ${where(item)}`),
    );
  }

  return lines;
}

export function report(verdict, removed) {
  const added = verdict.items.length > 0 ? ['Added:', ...verdict.items.map(itemLine)] : [];
  const gone = removed.length > 0 ? ['Removed:', ...removed.map((item) => `  − "${item.text}"  ${where(item)}`)] : [];
  const summary = `Copy: +${verdict.items.length} −${removed.length}`;

  return [...added, ...gone, ...failureLines(verdict), '', summary].join('\n').trim();
}
