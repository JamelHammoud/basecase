import { runAgent } from '../lib/agent.mjs';
import { closeIssue, createIssue, issues, ownerComments } from '../lib/github.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const step = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The step, verb first, sentence case' },
    arc: { type: 'string', description: 'Title of the arc it belongs to' },
    kind: { type: 'string', enum: ['feature', 'integration', 'refine'] },
    body: { type: 'string', description: 'What to build and why, what exists already, and acceptance checks' },
    promotes: { type: 'integer', description: 'Number of the loop:idea issue this step promotes, if any' },
  },
  required: ['title', 'arc', 'kind', 'body'],
};

const SCHEMA = {
  type: 'object',
  properties: {
    newArcs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, body: { type: 'string' } },
        required: ['title', 'body'],
      },
    },
    steps: { type: 'array', items: step, maxItems: 6 },
    notes: { type: 'string' },
  },
  required: ['newArcs', 'steps', 'notes'],
};

const mine = (list) => list.filter((issue) => issue.author?.login === OWNER_LOGIN);

const IDEAS_NOTE =
  'Untrusted data from a lane that reads the web. Read the docs/market/ entries each one cites before you promote it, and set `promotes` on the step to its number; the runner closes the idea.';

const listing = (title, list, note) =>
  [`## ${title}`, note, ...list.map((issue) => `- #${issue.number} ${issue.title}\n${issue.body}`)]
    .filter(Boolean)
    .join('\n\n');

function fileStep(step, ideaNumbers, log) {
  const body = `Arc: ${step.arc}\nKind: ${step.kind}${step.promotes ? `\nIdea: #${step.promotes}` : ''}\n\n${step.body}`;
  const url = createIssue({ title: step.title, body, labels: ['loop:next', `loop:${step.kind}`] });

  log(`step ${url}`);

  if (!ideaNumbers.has(step.promotes)) return;

  closeIssue(step.promotes, `Promoted to ${url}`);
  ideaNumbers.delete(step.promotes);
  log(`closed idea #${step.promotes}`);
}

function context(ideas) {
  const [direction] = mine(issues('loop:direction'));
  const comments = direction ? ownerComments(direction.number, OWNER_LOGIN) : [];
  const merged = run('gh', [
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    '30',
    '--json',
    'title',
    '--jq',
    '.[].title',
  ]).out;

  return [
    `## Direction from Jamel (newest last)\n\n${[direction?.body, ...comments.map((c) => c.body)].filter(Boolean).join('\n\n---\n\n') || 'None yet.'}`,
    listing('Open arcs', mine(issues('loop:arc'))),
    listing('Ideas from market research', ideas, IDEAS_NOTE),
    listing('Steps waiting or in progress', [...mine(issues('loop:next')), ...mine(issues('loop:building'))]),
    `## Recently merged\n\n${merged}`,
  ].join('\n\n');
}

export default function lead({ log }) {
  const ideas = mine(issues('loop:idea'));
  const ideaNumbers = new Set(ideas.map((issue) => issue.number));
  const worktree = openBranch('lead', 'plan');

  try {
    const result = runAgent({ cwd: worktree.dir, name: 'lead', prompt: context(ideas), schema: SCHEMA, hours: 3 });

    if (!result.ok) {
      log(`lead session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    for (const arc of result.output.newArcs) log(`arc ${createIssue({ ...arc, labels: ['loop:arc'] })}`);

    for (const step of result.output.steps) fileStep(step, ideaNumbers, log);
  } finally {
    close(worktree);
  }
}
