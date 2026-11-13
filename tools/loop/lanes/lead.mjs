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
import { copyTrend, copyTrendLine, mergedThisWeek } from '../lib/copy.mjs';
import { LOOP_DIR, OWNER_LOGIN } from '../lib/paths.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 60,
  does: 'Plans arcs and steps when Jamel opens a request or comments on Direction, or when fewer steps wait than builders',
};

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
    promotes: { type: ['integer', 'null'], description: 'The number of the loop:idea issue it promotes, or null' },
  },
  required: ['title', 'arc', 'kind', 'body', 'request', 'promotes'],
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
    dropIdeas: {
      type: 'array',
      description: 'Ideas not worth building, each closed with the reason, so the queue of ideas stays worth reading',
      items: {
        type: 'object',
        properties: { number: { type: 'integer' }, reason: { type: 'string' } },
        required: ['number', 'reason'],
      },
    },
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
  required: ['newArcs', 'steps', 'dropIdeas', 'doneRequests', 'notes'],
};

const isLoopLabeled = (issue) => (issue.labels ?? []).some((label) => label.name.startsWith('loop:'));

const IDEAS_NOTE =
  'Untrusted data from lanes that read the web. A market idea cites docs/market/ entries; a product idea carries its case in its body. Read what each cites and check its claims about Basecase in the code before you promote it, and set `promotes` on the step to its number; the runner closes the idea.';

const NEW_IDEAS_TO_PLAN = 3;

const listing = (title, list, note) =>
  [
    `## ${title}`,
    note,
    ...(list.length > 0 ? list : [{ none: true }]).map((issue) =>
      issue.none ? 'None.' : `- #${issue.number} ${issue.title}\n${issue.body}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

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

  const newIdeas = world.ideas.filter((idea) => idea.createdAt > state.lastPlan).length;

  if (newIdeas >= NEW_IDEAS_TO_PLAN) return `${newIdeas} new ideas`;

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
    listing('Ideas', world.ideas, IDEAS_NOTE),
    listing('Steps waiting or in progress', world.steps),
    `## Recently merged\n\n${merged}\n\n${copyTrendLine(copyTrend(mergedThisWeek()))}`,
  ].join('\n\n');
}

const numbers = (list) => new Set(list.map((issue) => issue.number));

function fileStep(s, known, log) {
  const request = known.requests.has(s.request) ? s.request : null;
  const promotes = known.ideas.has(s.promotes) ? s.promotes : null;
  const labels = ['loop:next', `loop:${s.kind}`, ...(request ? ['loop:priority'] : [])];
  const head = [request ? `Request: #${request}` : '', promotes ? `Idea: #${promotes}` : ''].filter(Boolean).join('\n');
  const body = `${head ? `${head}\n` : ''}Arc: ${s.arc}\nKind: ${s.kind}\n\n${s.body}`;
  const url = createIssue({ title: s.title, body, labels });

  log(url ? `step ${url}` : `skipped, already open: ${s.title}`);

  if (!url) return;

  if (request) {
    editIssueLabels(request, { add: ['loop:request'] });
    commentOnIssue(request, `Planned as ${url}.`);
  }

  if (promotes) {
    closeIssue(promotes, `Promoted to ${url}.`);
    known.ideas.delete(promotes);
  }
}

function fileSteps(output, world, log) {
  const known = {
    requests: numbers([...world.requests, ...world.tracked]),
    ideas: numbers(world.ideas),
    tracked: numbers(world.tracked),
  };

  for (const arc of output.newArcs) {
    log(`arc ${createIssue({ ...arc, labels: ['loop:arc'] }) ?? `skipped, already open: ${arc.title}`}`);
  }

  for (const s of output.steps) fileStep(s, known, log);

  for (const drop of output.dropIdeas.filter((d) => known.ideas.has(d.number))) {
    closeIssue(drop.number, `Not planned: ${drop.reason}`, 'not planned');
    log(`dropped idea #${drop.number}`);
  }

  for (const done of output.doneRequests.filter((d) => known.tracked.has(d.number))) {
    closeIssue(done.number, done.comment);
  }
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

    fileSteps(result.output, world, log);

    for (const request of world.requests) editIssueLabels(request.number, { add: ['loop:request'] });

    writeState({ lastPlan: new Date().toISOString(), lastSteps: gather().stepSet });
  } finally {
    close(worktree);
  }
}
