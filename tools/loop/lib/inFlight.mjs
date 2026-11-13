import { openPulls } from './github.mjs';
import { json } from './sh.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

export const mergedLastDay = (now = Date.now()) =>
  json('gh', [
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    '100',
    '--search',
    `merged:>=${new Date(now - DAY_MS).toISOString().slice(0, 19)}Z`,
    '--json',
    'number,title,createdAt',
  ]) ?? [];

export function inFlightText({ open, merged, except }) {
  const lines = [
    ...open.filter((pull) => pull.number !== except).map((pull) => `- #${pull.number} (open) ${pull.title}`),
    ...merged.map((pull) => `- #${pull.number} (merged) ${pull.title}`),
  ];

  return lines.length > 0 ? lines.join('\n') : '(none)';
}

export function duplicateTarget({ duplicateOf, pull, open, merged }) {
  if (!duplicateOf || duplicateOf === pull.number) return null;

  if (merged.some((other) => other.number === duplicateOf)) return duplicateOf;

  const older = open.find((other) => other.number === duplicateOf && other.createdAt < pull.createdAt);

  return older ? duplicateOf : null;
}

export const inFlight = () => {
  const open = openPulls();
  const merged = mergedLastDay();

  return { open, merged };
};
