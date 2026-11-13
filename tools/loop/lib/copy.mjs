import { copyDiffOfRange, formatCopyDiff } from '../../copy-diff.mjs';
import { json } from './sh.mjs';

const NET = /^Copy: .*, net ([+-]?\d+)$/m;

export function copyReport(dir, { base = 'origin/main', head = 'HEAD' } = {}) {
  try {
    const diff = copyDiffOfRange({ cwd: dir, base, head });

    return { net: diff.net, text: formatCopyDiff(diff) };
  } catch (error) {
    return { net: null, text: `Copy: not counted (${error.message.split('\n')[0]})` };
  }
}

const UNCOUNTED_NOTE = 'The count failed, so read every user-facing string in the diff yourself, with the same rule.';

export const copyReviewNote = ({ net }) => {
  if (net === null) return UNCOUNTED_NOTE;

  return net > 0
    ? 'This pull request adds more user-facing strings than it removes. Each added string needs a `copy:` line in the body naming why nothing on screen already says it; fail it with a blocker for every one whose reason is missing or does not hold up.'
    : 'It adds no more user-facing strings than it removes; still judge each added or changed string by the §3d checklist.';
};

export const copyNetOf = (comments) =>
  comments
    .map(({ body }) => NET.exec(body ?? ''))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .at(-1) ?? null;

export function copyTrend(pulls) {
  const nets = pulls.map((pull) => copyNetOf(pull.comments ?? [])).filter((net) => net !== null);
  const total = nets.reduce((sum, net) => sum + net, 0);

  return { total, counted: nets.length, merged: pulls.length };
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

export const copyTrendLine = ({ total, counted }) =>
  `Copy this week: net ${signed(total)} strings across ${counted} merged pull request${counted === 1 ? '' : 's'}`;

const DAY_MS = 24 * 60 * 60 * 1000;

export const mergedThisWeek = (now = Date.now()) =>
  json('gh', [
    'pr',
    'list',
    '--state',
    'merged',
    '--search',
    `merged:>=${new Date(now - 7 * DAY_MS).toISOString().slice(0, 10)}`,
    '--limit',
    '200',
    '--json',
    'number,comments',
  ]) ?? [];
