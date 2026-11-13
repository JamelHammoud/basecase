import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const QUARANTINE_FILE = path.join(ROOT, 'tools', 'quarantine.json');
export const UNIT_CONFIG = 'vitest.config.ts';
export const E2E_CONFIG = 'vitest.e2e.config.ts';

const KEYS = ['file', 'test', 'issue', 'until', 'reason'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const today = () => new Date().toISOString().slice(0, 10);

export const quarantineMode = () => process.env.BASECASE_QUARANTINE || 'skip';

export function configFor(file) {
  if (/^e2e\/(?!app\/).+\.e2e\.test\.ts$/.test(file)) return E2E_CONFIG;

  if (/^(src|electron|tools|bench|verify\/lib)\/.+\.test\.(ts|mjs)$/.test(file)) return UNIT_CONFIG;

  return null;
}

function isRealDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false;

  const time = Date.parse(`${value}T00:00:00Z`);

  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

function fileProblem(file, exists) {
  if (typeof file !== 'string' || file === '') return 'needs a "file"';

  if (!configFor(file)) return `has a file that no unit or e2e run includes: ${file}`;

  return exists(file) ? null : `names a file that doesn't exist: ${file}`;
}

function entryProblems(entry, exists) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['is not an object'];

  const unknown = Object.keys(entry).filter((key) => !KEYS.includes(key));
  const problems = [
    ...unknown.map((key) => `has an unknown key "${key}"`),
    ...KEYS.filter((key) => !(key in entry)).map((key) => `needs "${key}"`),
    fileProblem(entry.file, exists),
    typeof entry.test === 'string' ? null : '"test" must be a string, empty for the whole file',
    Number.isInteger(entry.issue) && entry.issue > 0 ? null : '"issue" must be an issue number',
    isRealDay(entry.until) ? null : '"until" must be a date, YYYY-MM-DD',
    typeof entry.reason === 'string' && entry.reason.trim() !== '' ? null : 'needs a "reason"',
  ];

  return [...new Set(problems.filter(Boolean))];
}

const fileExists = (file) => fs.existsSync(path.join(ROOT, file));

export function validateQuarantine(entries, { exists = fileExists } = {}) {
  if (!Array.isArray(entries)) return ['tools/quarantine.json must hold a list'];

  const seen = new Set();

  return entries.flatMap((entry, index) => {
    const key = `${entry?.file}\u0000${entry?.test}`;
    const problems = entryProblems(entry, exists);

    if (seen.has(key)) problems.push('repeats an earlier entry');

    seen.add(key);

    return problems.map((problem) => `Entry ${index + 1} ${problem}`);
  });
}

export function loadQuarantine(file = QUARANTINE_FILE) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = validateQuarantine(entries);

  if (problems.length > 0) throw new Error(`Quarantine list is invalid:\n${problems.join('\n')}`);

  return entries;
}

export const activeEntries = (entries, day = today()) => entries.filter((entry) => entry.until > day);

export function quarantineExclude(entries = loadQuarantine(), day = today()) {
  if (quarantineMode() !== 'skip') return [];

  return activeEntries(entries, day)
    .filter((entry) => entry.test === '')
    .map((entry) => entry.file);
}

export const entryMatches = (entry, { file, name, fullName }) =>
  entry.file === file && (entry.test === '' || entry.test === name || entry.test === fullName);

if (import.meta.main) {
  try {
    const entries = loadQuarantine();
    const active = activeEntries(entries).length;

    console.log(`Quarantine list is valid: ${active} active of ${entries.length}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
