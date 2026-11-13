import { runAgent } from '../lib/agent.mjs';
import { claim, held } from '../lib/claim.mjs';
import { closeIssue, commentOnIssue, hasLabel, issues, setIssueBody } from '../lib/github.mjs';
import {
  applyGroom,
  BUILDING,
  dueSteps,
  GROOM_SCHEMA,
  groomedThrough,
  mergedAfter,
  mergedWindowStart,
} from '../lib/groom.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { json } from '../lib/sh.mjs';
import { stepPullIndex, stepStatus } from '../lib/stepPulls.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: 'Grooms the waiting steps against main: rewrites merged dependencies, closes what main does and folds duplicates',
};

const NEXT = 'loop:next';
const BATCH = 12;

const groomed = store('groom', { head: '', groomedAt: 0 });

const mergedPullsSince = (at) =>
  (
    json('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      '1000',
      '--search',
      `merged:>=${new Date(at).toISOString().slice(0, 19)}Z`,
      '--json',
      'number,title,mergedAt',
    ]) ?? []
  ).sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));

const issueNow = (number) =>
  json('gh', ['issue', 'view', String(number), '--json', 'state,labels,body'], { allowFail: true });

function mergedPull(number) {
  const pull = json('gh', ['pr', 'view', String(number), '--json', 'number,title,url,state'], { allowFail: true });

  return pull?.state === 'MERGED' ? pull : null;
}

const liveGitHub = { claim, issueNow, mergedPull, setIssueBody, commentOnIssue, closeIssue };

function dryGitHub(steps, writes) {
  const record =
    (kind) =>
    (...args) =>
      writes.push([kind, ...args]);

  return {
    claim: (key) => (held(key) ? null : () => {}),
    issueNow: (number) => ({ ...steps.get(number), state: 'OPEN' }),
    mergedPull,
    setIssueBody: record('body'),
    commentOnIssue: record('comment'),
    closeIssue: record('close'),
  };
}

const date = (at) => new Date(at).toISOString().slice(0, 10);

const labelsOf = (step) => (step.labels ?? []).map((l) => l.name).join(', ');

function stepSection(step, { entryOf, merged }) {
  const since = groomedThrough(step, entryOf(step.number));
  const fresh = mergedAfter(merged, since).map((pull) => `#${pull.number}`);

  return [
    `### #${step.number} ${step.title}`,
    `Labels: ${labelsOf(step)}. Filed ${date(step.createdAt)}.`,
    `Merged since it was last groomed (${date(since)}): ${fresh.join(', ') || 'none'}`,
    step.body,
  ].join('\n\n');
}

export function groomPrompt({ batch, waiting, merged, entryOf }) {
  const sent = new Set(batch.map((step) => step.number));

  return [
    `Groom these ${batch.length} waiting steps against main, which is checked out here. Answer one decision per step.`,
    '## Pull requests merged in the window',
    merged.map((pull) => `- #${pull.number} (${date(pull.mergedAt)}) ${pull.title}`).join('\n') || 'None.',
    '## Other waiting steps',
    waiting
      .filter((step) => !sent.has(step.number))
      .map((step) => `- #${step.number} ${step.title}`)
      .join('\n') || 'None.',
    '## Steps to groom',
    ...batch.map((step) => stepSection(step, { entryOf, merged })),
  ].join('\n\n');
}

function waitingSteps(index) {
  return issues(NEXT).filter(
    (step) =>
      !hasLabel(step, BUILDING) && step.author?.login === OWNER_LOGIN && stepStatus(index, step.number) === 'none',
  );
}

const chunks = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function groomBatch(batch, { world, worktree, dry, log }) {
  const prompt = groomPrompt({ batch, ...world });
  const result = runAgent({ cwd: worktree.dir, name: 'groom', prompt, schema: GROOM_SCHEMA, hours: 2 });

  if (!result.ok) {
    log(`groom session failed: ${String(result.error).slice(0, 500)}`);

    return [];
  }

  const steps = new Map(world.waiting.map((step) => [step.number, step]));
  const writes = [];
  const context = {
    steps,
    sent: new Set(batch.map((step) => step.number)),
    openRequests: new Set(issues('loop:request').map((request) => request.number)),
    now: world.now,
    save: dry ? () => {} : groomed.save,
  };
  const gh = dry ? dryGitHub(steps, writes) : liveGitHub;
  const outcomes = applyGroom(result.output.decisions, context, { gh, log });

  if (result.output.notes) log(`notes: ${result.output.notes.slice(0, 1000)}`);

  return outcomes.map((outcome) => ({
    ...outcome,
    decision: result.output.decisions.find((d) => d.number === outcome.number && d.action === outcome.action),
  }));
}

export function groomQueue({ log, dry = false }) {
  const index = stepPullIndex();

  if (!index) {
    log('could not read the pull requests; grooming nothing');

    return [];
  }

  const now = Date.now();
  const waiting = waitingSteps(index);
  const free = waiting.filter((step) => !held(`step-${step.number}`));
  const merged = mergedPullsSince(mergedWindowStart(free, groomed.get, now));
  const due = dueSteps(free, { entryOf: groomed.get, merged });

  if (due.length === 0) {
    log(`all ${waiting.length} waiting steps are groomed against main`);

    return [];
  }

  log(`grooming ${due.length} of ${waiting.length} waiting steps against ${merged.length} merged pull requests`);

  const world = { waiting, merged, entryOf: groomed.get, now };
  const worktree = openBranch('groom', 'queue');

  try {
    return chunks(due, BATCH).flatMap((batch) => groomBatch(batch, { world, worktree, dry, log }));
  } finally {
    close(worktree);
  }
}

export default function groom({ log }) {
  groomQueue({ log });
}
