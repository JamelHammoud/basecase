import { cached } from './cache.mjs';
import { repo } from './github.mjs';
import { OWNER_LOGIN } from './paths.mjs';
import { json } from './sh.mjs';
import { stepsOf } from './stepLinks.mjs';

export { stepsOf } from './stepLinks.mjs';

function inheritedSteps(pull, pulls, seen = new Set()) {
  if (!pull || seen.has(pull.number)) return [];

  seen.add(pull.number);

  const parents = [...(pull.body ?? '').matchAll(/\bRebuilds #(\d+)\b/g)];

  return [
    ...new Set([
      ...stepsOf(pull),
      ...parents.flatMap((match) => inheritedSteps(pulls.get(Number(match[1])), pulls, seen)),
    ]),
  ];
}

export function indexByStep(pulls) {
  const index = new Map();
  const byNumber = new Map(pulls.map((pull) => [pull.number, pull]));

  for (const pull of pulls) {
    for (const step of inheritedSteps(pull, byNumber)) index.set(step, [...(index.get(step) ?? []), pull]);
  }

  return index;
}

export function stepStatus(index, step) {
  const pulls = index.get(step) ?? [];

  if (pulls.some((pull) => pull.state === 'MERGED')) return 'merged';

  return pulls.some((pull) => pull.state === 'OPEN') ? 'open' : 'none';
}

const successorOf = (comments, slug) => {
  const prefix = `Rebuilt as https://github.com/${slug}/pull/`;
  const comment = comments.find(
    (item) => item.author === OWNER_LOGIN && item.body.startsWith(prefix) && item.body.includes('<!-- loop -->'),
  );

  return Number(comment?.body.slice(prefix.length).match(/^(\d+)\./)?.[1]) || null;
};

export function recoverStepPulls(index, { steps, commentsOf, pullOf, slug }) {
  for (const step of steps) {
    if (stepStatus(index, step.number) === 'merged') continue;

    const queue = [...(index.get(step.number) ?? [])];
    const seen = new Set(queue.map((pull) => pull.number));

    for (const pull of queue) {
      const successor = pull.state === 'CLOSED' ? successorOf(commentsOf(pull.number), slug) : null;

      if (!successor || seen.has(successor)) continue;

      seen.add(successor);

      const rebuilt = pullOf(successor);

      if (!rebuilt) continue;

      index.set(step.number, [...(index.get(step.number) ?? []), rebuilt]);
      queue.push(rebuilt);
    }
  }

  return index;
}

const PULL_QUERY = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $endCursor) {
      nodes { number state headRefName body labels(first: 100) { nodes { name } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

function load() {
  const [owner, name] = repo().split('/');
  const pages = json('gh', [
    'api',
    'graphql',
    '--paginate',
    '--slurp',
    '-f',
    `query=${PULL_QUERY}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
  ]);

  return (
    pages
      ?.flatMap((page) => page.data.repository.pullRequests.nodes)
      .map((pull) => ({ ...pull, labels: pull.labels.nodes })) ?? null
  );
}

export function stepPullIndex({ fresh = false } = {}) {
  const pulls = cached('all-step-pulls', { ttlMs: 60_000, refresh: fresh }, () => load() ?? null);

  return Array.isArray(pulls) ? indexByStep(pulls) : null;
}
