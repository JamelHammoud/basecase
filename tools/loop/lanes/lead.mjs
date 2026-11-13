import fs from 'node:fs';
import path from 'node:path';
import { runAgent } from '../lib/agent.mjs';
import {
  closeIssue,
  commentOnIssue,
  createIssue,
  editIssueLabels,
  hasLabel,
  openIssues,
  ownerComments,
} from '../lib/github.mjs';
import { LOOP_DIR, OWNER_LOGIN } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const BUILDERS = 5;
const STATE_FILE = path.join(LOOP_DIR, 'state', 'lead.json');

const step = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The step, verb first, sentence case' },
    arc: { type: 'string', description: 'Title of the arc it belongs to' },
    kind: { type: 'string', enum: ['feature', 'integration', 'refine'] },
    body: { type: 'string', description: 'What to build and why, what exists already, and acceptance checks' },
    request: { type: ['integer', 'null'], description: "The number of Jamel's request it serves, or null" },
  },
  required: ['title', 'arc', 'kind', 'body', 'request'],
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
    steps: { type: 'array', items: step, maxItems: 8 },
    doneRequests: {
      type: 'array',
      items: {
        type: 'object',
        properties: { number: { type: 'integer' }, comment: { type: 'string' } },
        required: ['number', 'comment'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['newArcs', 'steps', 'doneRequests', 'notes'],
};

const isLoopLabeled = (issue) => (issue.labels ?? []).some((label) => label.name.startsWith('loop:'));

const listing = (title, list) =>
  [`## ${title}`, ...list.map((issue) => `- #${issue.number} ${issue.title}\n${issue.body}`)].join('\n\n') ||
  `## ${title}\n\nNone.`;

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastPlan: '1970-01-01T00:00:00Z', lastSteps: '' };
  }
};

const writeState = (state) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
};

function gather() {
  const mine = openIssues().filter((issue) => issue.author?.login === OWNER_LOGIN);
  const direction = mine.find((issue) => hasLabel(issue, 'loop:direction'));

  return {
    requests: mine.filter((issue) => !isLoopLabeled(issue)),
    tracked: mine.filter((issue) => hasLabel(issue, 'loop:request')),
    arcs: mine.filter((issue) => hasLabel(issue, 'loop:arc')),
    ideas: mine.filter((issue) => hasLabel(issue, 'loop:idea')),
    steps: mine.filter((issue) => hasLabel(issue, 'loop:next') || hasLabel(issue, 'loop:building')),
    waiting: mine.filter((issue) => hasLabel(issue, 'loop:next')).length,
    stepSet: mine
      .filter((issue) => hasLabel(issue, 'loop:next') || hasLabel(issue, 'loop:building'))
      .map((issue) => issue.number)
      .sort((a, b) => a - b)
      .join(','),
    direction,
    comments: direction ? ownerComments(direction.number, OWNER_LOGIN) : [],
  };
}

const reasonToPlan = (world, state) => {
  if (world.requests.length > 0) return `${world.requests.length} new request(s) from Jamel`;

  if (world.comments.some((comment) => comment.created_at > state.lastPlan)) return 'new direction from Jamel';

  const queueChanged = world.stepSet !== state.lastSteps;

  return world.waiting < BUILDERS && queueChanged ? `${world.waiting} steps waiting for ${BUILDERS} builders` : null;
};

function prompt(world) {
  const merged = run('gh', [
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    '40',
    '--json',
    'title',
    '--jq',
    '.[].title',
  ]).out;
  const direction = [world.direction?.body, ...world.comments.map((c) => c.body)].filter(Boolean).join('\n\n---\n\n');

  return [
    `## Direction from Jamel (newest last)\n\n${direction || 'None yet.'}`,
    listing("New requests from Jamel: plan these first, every one, citing the request's number", world.requests),
    listing("Jamel's requests already in progress", world.tracked),
    listing('Open arcs', world.arcs),
    listing('Ideas from market research', world.ideas),
    listing('Steps waiting or in progress', world.steps),
    `## Recently merged\n\n${merged}`,
  ].join('\n\n');
}

function fileSteps(output, log) {
  for (const arc of output.newArcs) {
    log(`arc ${createIssue({ ...arc, labels: ['loop:arc'] }) ?? `skipped, already open: ${arc.title}`}`);
  }

  for (const s of output.steps) {
    const labels = ['loop:next', `loop:${s.kind}`, ...(s.request ? ['loop:priority'] : [])];
    const from = s.request ? `Request: #${s.request}\n` : '';
    const url = createIssue({ title: s.title, body: `${from}Arc: ${s.arc}\nKind: ${s.kind}\n\n${s.body}`, labels });

    log(url ? `step ${url}` : `skipped, already open: ${s.title}`);

    if (url && s.request) {
      editIssueLabels(s.request, { add: ['loop:request'] });
      commentOnIssue(s.request, `Planned as ${url}.`);
    }
  }

  for (const done of output.doneRequests) closeIssue(done.number, done.comment);
}

export default function lead({ log }) {
  const world = gather();
  const state = readState();
  const reason = reasonToPlan(world, state);

  if (!reason) {
    log('no reason to plan');

    return;
  }

  const worktree = openBranch('lead', 'plan');

  try {
    log(`planning: ${reason}`);

    const result = runAgent({ cwd: worktree.dir, name: 'lead', prompt: prompt(world), schema: SCHEMA, hours: 2 });

    if (!result.ok) {
      log(`lead session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    fileSteps(result.output, log);

    for (const request of world.requests) editIssueLabels(request.number, { add: ['loop:request'] });

    writeState({ lastPlan: new Date().toISOString(), lastSteps: gather().stepSet });
  } finally {
    close(worktree);
  }
}
