import crypto from 'node:crypto';
import { hasLabel } from './github.mjs';

export const BUILDING = 'loop:building';
export const PRIORITY = 'loop:priority';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 30 * DAY_MS;
const METADATA = /^(Request|Idea|Arc|Kind):/;
const REQUEST = /^Request: #(\d+)/m;

export const ACTIONS = ['keep', 'rewrite', 'close', 'fold'];

export const GROOM_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'The step being groomed' },
          action: { type: 'string', enum: ACTIONS },
          reason: { type: 'string', description: 'One sentence, posted on the step for rewrite, close and fold' },
          body: { type: 'string', description: 'For rewrite: the whole new body; else empty' },
          pull: { type: ['integer', 'null'], description: 'For close: the merged pull request that already does it' },
          into: { type: ['integer', 'null'], description: 'For fold: the waiting step that takes this one over' },
          append: { type: 'string', description: 'For fold: the lines to append to that step; else empty' },
        },
        required: ['number', 'action', 'reason', 'body', 'pull', 'into', 'append'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['decisions', 'notes'],
};

export const stepHead = (step) =>
  crypto
    .createHash('sha256')
    .update(`${step.title}\n${step.body ?? ''}`)
    .digest('hex')
    .slice(0, 16);

export const groomedThrough = (step, entry) => entry.groomedAt || Date.parse(step.createdAt) || 0;

export const mergedAfter = (merged, at) => merged.filter((pull) => Date.parse(pull.mergedAt) > at);

export const mergedWindowStart = (steps, entryOf, now) =>
  Math.max(now - LOOKBACK_MS, Math.min(now, ...steps.map((step) => groomedThrough(step, entryOf(step.number)))));

export const dueSteps = (steps, { entryOf, merged }) =>
  steps.filter((step) => {
    const entry = entryOf(step.number);

    return entry.head !== stepHead(step) || mergedAfter(merged, groomedThrough(step, entry)).length > 0;
  });

export function keepMetadata(oldBody, newBody) {
  const metadata = String(oldBody ?? '')
    .split('\n')
    .filter((line) => METADATA.test(line));
  const rest = String(newBody ?? '')
    .split('\n')
    .filter((line) => !METADATA.test(line))
    .join('\n')
    .trim();

  return metadata.length > 0 ? `${metadata.join('\n')}\n\n${rest}` : rest;
}

const servesOpenRequest = (step, openRequests) => {
  const request = REQUEST.exec(step.body ?? '');

  return Boolean(request) && openRequests.has(Number(request[1]));
};

export const isProtectedStep = (step, openRequests) =>
  hasLabel(step, PRIORITY) || servesOpenRequest(step, openRequests);

const oneLine = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function withStep(step, { gh }, act) {
  const release = gh.claim(`step-${step.number}`);

  if (!release) return `skipped #${step.number}: a builder holds it`;

  try {
    const now = gh.issueNow(step.number);

    if (now?.state !== 'OPEN' || hasLabel(now, BUILDING)) return `skipped #${step.number}: a builder took it`;

    if (now.body !== step.body) return `skipped #${step.number}: its body changed since it was sent`;

    return act();
  } finally {
    release();
  }
}

function keep(decision, { step, state }) {
  state.save(step.number, { head: stepHead(step), groomedAt: state.now });

  return 'kept';
}

function rewrite(decision, context) {
  const { step, state, deps } = context;
  const body = keepMetadata(step.body, decision.body);

  if (!oneLine(decision.body) || body === step.body) return keep(decision, context);

  deps.gh.setIssueBody(step.number, body);
  deps.gh.commentOnIssue(step.number, `Groomed against main: ${oneLine(decision.reason)}`);
  state.steps.set(step.number, { ...step, body });
  state.save(step.number, { head: stepHead({ ...step, body }), groomedAt: state.now });

  return 'rewritten';
}

function close(decision, { step, state, deps }) {
  const pull = decision.pull ? deps.gh.mergedPull(decision.pull) : null;

  if (!pull) return 'kept: a close needs the merged pull request that already does it';

  deps.gh.closeIssue(step.number, `Already on main: ${oneLine(decision.reason)} Done in ${pull.url}.`);
  state.gone.add(step.number);

  return `closed: done in #${pull.number}`;
}

function foldRefusal(decision, { step, state }) {
  const target = state.steps.get(decision.into);

  if (!target || target.number === step.number || state.gone.has(target.number)) {
    return 'kept: the fold target is not a waiting step';
  }

  if (isProtectedStep(step, state.openRequests)) {
    return 'kept: a priority or requested step is never folded away; fold the other step into it';
  }

  return oneLine(decision.append) ? null : 'kept: a fold needs lines to append';
}

function fold(decision, context) {
  const { step, state, deps } = context;
  const refusal = foldRefusal(decision, context);

  if (refusal) return refusal;

  const target = state.steps.get(decision.into);

  return withStep(target, deps, () => {
    const body = `${target.body}\n\n**Folded from #${step.number}.**\n\n${decision.append.trim()}`;

    deps.gh.setIssueBody(target.number, body);
    deps.gh.closeIssue(step.number, `Folded into #${target.number}: ${oneLine(decision.reason)}`, 'not planned');
    state.steps.set(target.number, { ...target, body });
    state.grown.add(target.number);
    state.gone.add(step.number);

    return `folded into #${target.number}`;
  });
}

const APPLY = { keep, rewrite, close, fold };

function applyDecision(decision, state, deps) {
  const step = state.steps.get(decision.number);

  if (!step || !state.sent.has(decision.number)) return 'skipped: not a step sent this run';

  if (state.gone.has(step.number) || state.grown.has(step.number)) return 'skipped: already changed this run';

  const act = APPLY[decision.action];

  if (!act) return `skipped: unknown action ${decision.action}`;

  return withStep(step, deps, () => act(decision, { step, state, deps }));
}

export function applyGroom(decisions, context, deps) {
  const state = { ...context, steps: new Map(context.steps), gone: new Set(), grown: new Set() };

  return decisions.map((decision) => {
    const outcome = applyDecision(decision, state, deps);

    deps.log(`#${decision.number} ${decision.action}: ${outcome}`);

    return { number: decision.number, action: decision.action, outcome };
  });
}
