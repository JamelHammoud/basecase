import { cached } from './cache.mjs';
import { json } from './sh.mjs';
import { store } from './store.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const IDEA_CHARS = 200;

export const REFINE_DAYS = 14;

export const refineIdeas = store('refine', { title: '', idea: '', at: 0 });

export const mergedRefines = (now = Date.now()) =>
  cached(
    `refines-merged-${REFINE_DAYS}d`,
    { ttlMs: 10 * 60_000 },
    () =>
      json('gh', [
        'pr',
        'list',
        '--state',
        'merged',
        '--label',
        'loop:refine',
        '--limit',
        '300',
        '--search',
        `merged:>=${new Date(now - REFINE_DAYS * DAY_MS).toISOString().slice(0, 10)}`,
        '--json',
        'number,title,mergedAt',
      ]) ?? [],
  );

export const ideaOf = (summary) => {
  const text = String(summary ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const [first] = text.split(/(?<=[.!?])\s/);

  return first.length > IDEA_CHARS ? `${first.slice(0, IDEA_CHARS - 1)}…` : first;
};

export const pullNumberOf = (url) => Number(/\/pull\/(\d+)/.exec(String(url ?? ''))?.[1]) || null;

const ideaByNumber = (ideas) => new Map(ideas.map((entry) => [Number(entry.key), entry.idea]));

export function recentRefinesText({ open, merged, ideas }) {
  const known = ideaByNumber(ideas);
  const line = (pull, state) => {
    const idea = known.get(pull.number);

    return `- #${pull.number} (${state}) ${pull.title}${idea ? `\n  ${idea}` : ''}`;
  };
  const lines = [...open.map((pull) => line(pull, 'open')), ...merged.map((pull) => line(pull, 'merged'))];

  return lines.length > 0 ? lines.join('\n') : '(none)';
}
