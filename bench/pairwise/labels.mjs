import fs from 'node:fs';
import path from 'node:path';

export const WINNERS = new Set(['a', 'b', 'tie', 'unknown']);

export function parseLabelLine(line, { base = '.', lineNo = 0 } = {}) {
  const raw = JSON.parse(line);
  const problems = [];

  if (!raw.id) problems.push('id is missing');

  if (!raw.a || !raw.b) problems.push('a and b must name two images');

  if (raw.winner !== undefined && !WINNERS.has(raw.winner)) problems.push(`winner must be a, b, tie or unknown`);

  if (problems.length) throw new Error(`Line ${lineNo}: ${problems.join('; ')}`);

  return {
    id: String(raw.id),
    a: path.resolve(base, raw.a),
    b: path.resolve(base, raw.b),
    itemA: raw.items?.a ?? raw.a,
    itemB: raw.items?.b ?? raw.b,
    aspect: raw.aspect ?? 'craft',
    winner: raw.winner,
    labeler: raw.labeler,
    date: raw.date,
    note: raw.note,
  };
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l, i) => [l.trim(), i + 1])
    .filter(([l]) => l && !l.startsWith('#'));
}

export function readLabels(file) {
  const base = path.dirname(path.resolve(file));

  return readJsonl(file).map(([line, lineNo]) => parseLabelLine(line, { base, lineNo }));
}

export function readJudgements(file) {
  return readJsonl(file).map(([line]) => JSON.parse(line));
}

export function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
}
