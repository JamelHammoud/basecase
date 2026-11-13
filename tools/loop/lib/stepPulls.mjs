import { cached } from './cache.mjs';
import { json } from './sh.mjs';

const STEP_BRANCH = /^loop\/build\/(\d+)-/;

export function stepsOf(pull) {
  const closes = [...(pull.body ?? '').matchAll(/Closes #(\d+)/g)].map((match) => Number(match[1]));
  const branch = Number(STEP_BRANCH.exec(pull.headRefName ?? '')?.[1]);

  return [...new Set([...closes, ...(branch ? [branch] : [])])];
}

export function indexByStep(pulls) {
  const index = new Map();

  for (const pull of pulls) {
    for (const step of stepsOf(pull)) index.set(step, [...(index.get(step) ?? []), pull]);
  }

  return index;
}

export function stepStatus(index, step) {
  const pulls = index.get(step) ?? [];

  if (pulls.some((pull) => pull.state === 'MERGED')) return 'merged';

  return pulls.some((pull) => pull.state === 'OPEN') ? 'open' : 'none';
}

const load = () =>
  json('gh', ['pr', 'list', '--state', 'all', '--limit', '2000', '--json', 'number,state,headRefName,body']);

export function stepPullIndex({ fresh = false } = {}) {
  const pulls = cached('all-pulls', { ttlMs: 60_000, refresh: fresh }, () => load() ?? null);

  return Array.isArray(pulls) ? indexByStep(pulls) : null;
}
