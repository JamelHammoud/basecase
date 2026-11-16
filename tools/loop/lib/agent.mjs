import fs from 'node:fs';
import path from 'node:path';
import { BRIEFS } from './paths.mjs';
import { runCodex } from './codex.mjs';
import { runClaude, withoutGithub } from './claude.mjs';
import { policyFor, primaryAvailable, primaryReserve } from './agentPolicy.mjs';
import { quotaSnapshot, reserveOverflow } from './quota.mjs';
import { recordSession, SHARED_LANES } from './sessionJournal.mjs';
import { workIdentity } from './publicationJournal.mjs';
import { codexPause, isActive, pause, resumeCodex, startCodexPause, startPause, UsageLimit } from './usage.mjs';

export { sandboxArgs } from './claude.mjs';

const TELLING = new Set(['build', 'refine', 'revise', 'rebuild']);
const restoredAfter = (quota, held) => primaryAvailable(quota) && quota.at > (held?.observedAt ?? held?.since ?? 0);

export const brief = (name) =>
  [
    fs.readFileSync(path.join(BRIEFS, 'shared.md'), 'utf8'),
    fs.readFileSync(path.join(BRIEFS, `${name}.md`), 'utf8'),
    ...(TELLING.has(name) ? [fs.readFileSync(path.join(BRIEFS, 'telling.md'), 'utf8')] : []),
  ].join('\n\n');

const inferredTask = (options) => {
  const step = /^(?:step-|loop-build-)(\d+)(?:-|$)/.exec(options.task ?? path.basename(options.cwd));
  const pull = /^(?:review|revise|rebase)-(\d+)(?:-|$)/.exec(options.task ?? path.basename(options.cwd));

  if (step) return `step:${step[1]}`;

  return pull ? `pull:${pull[1]}` : undefined;
};

function invocationIdentity(options) {
  const workId = options.workId ?? workIdentity(options.cwd);

  return {
    worker: options.worker ?? process.env.BASECASE_LOOP_WORKER ?? process.env.BASECASE_LOOP_LANE ?? options.name,
    taskKind: options.taskKind,
    workId,
    taskId: options.taskId ?? inferredTask(options) ?? workId,
    continuedFrom: options.continuation?.id ?? null,
    previousInvocation: options.previousInvocation ?? null,
    shared: options.shared ?? SHARED_LANES.has(options.name),
  };
}

function measured(provider, options, execute) {
  const quotaBefore = quotaSnapshot(provider);
  const startedAt = Date.now();
  const pending = {
    provider,
    name: options.name,
    lane: options.name,
    ...invocationIdentity(options),
    model: provider === 'codex' ? options.policy.model : options.policy.claudeModel,
    effort: provider === 'codex' ? options.policy.effort : options.policy.claudeEffort,
    task: options.task ?? path.basename(options.cwd),
    startedAt,
    state: 'running',
    pid: process.pid,
  };
  const id = recordSession(pending);
  const result = execute(options);
  const finishedAt = Date.now();
  const quotaAfter = quotaSnapshot(provider);
  const journalId = recordSession({
    ...pending,
    id,
    state: 'completed',
    finishedAt,
    durationMs: finishedAt - startedAt,
    ok: result.ok,
    continued: Boolean(options.continuation),
    session: result.session,
    usage: result.usage,
    previousUsage: result.previousUsage,
    limited: Boolean(result.limited),
    formatRetried: Boolean(result.formatRetried),
    quotaBefore,
    quotaAfter,
    result: result.output
      ? {
          changed: result.output.changed,
          kind: result.output.kind,
          title: result.output.title,
          checked: result.output.checked,
          notes: result.output.notes,
          outcome: result.output.outcome,
          verdict: result.output.verdict,
        }
      : null,
    error: result.error?.slice(0, 1000),
  });

  return { ...result, provider, journalId };
}

const nextAvailability = () => {
  const times = [codexPause()?.until, pause()?.until].filter((at) => at > Date.now());

  return times.length ? Math.min(...times) : Date.now() + 15 * 60_000;
};

function overflow(options, primary) {
  if (isActive(pause())) throw new UsageLimit(nextAvailability());

  const release = reserveOverflow();

  if (!release) throw new UsageLimit(nextAvailability());

  try {
    const result = measured(
      'claude',
      { ...options, continuation: null, previousInvocation: primary?.journalId },
      runClaude,
    );

    if (result.limited) {
      startPause(result.limited.until);

      throw new UsageLimit(nextAvailability());
    }

    return { ...result, overflow: true, primaryJournalId: primary?.journalId };
  } finally {
    release();
  }
}

function limitedOverflow(options, primary) {
  startCodexPause(primary.limited.until);

  try {
    const result = overflow(options, primary);

    return { ...result, session: result.session ?? primary.session };
  } catch (error) {
    error.session ??= primary.session;

    throw error;
  }
}

export function primaryAllowed() {
  const quota = quotaSnapshot('codex');
  const reserve = primaryReserve(quota);
  const held = codexPause();
  const restored = restoredAfter(quota, held);

  if (reserve) {
    startCodexPause(reserve.reset);

    return false;
  }

  if (isActive(held) && !restored) return false;

  if (held && restored) resumeCodex();

  return true;
}

export function runAgent({
  cwd,
  name,
  prompt,
  schema,
  hours = 6,
  deadlineAt,
  sandbox,
  continuation,
  system,
  task,
  taskKind,
  taskId,
  workId,
  shared,
  worker,
}) {
  const policy = policyFor(name);
  const options = {
    cwd,
    name,
    prompt,
    schema,
    hours: deadlineAt ? Math.min(hours, (deadlineAt - Date.now()) / 3_600_000) : hours,
    deadlineAt,
    sandbox,
    continuation,
    policy,
    task,
    taskKind,
    taskId,
    workId,
    shared,
    worker,
    brief: system ?? brief(name),
  };

  if (options.hours <= 0) return { ok: false, session: continuation, error: 'Task execution deadline exhausted' };

  if (policy.provider === 'claude' || sandbox?.tools.length > 0) return overflow(options);

  if (!primaryAllowed()) return overflow(options);

  const launch = (env) => runCodex({ ...options, env });
  const result = measured('codex', options, () => (sandbox ? withoutGithub(launch) : launch()));

  if (result.limited) return limitedOverflow(options, result);

  return result;
}

const text = (description) => ({ type: 'string', description });

export const CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean', description: 'False when nothing should be merged' },
    kind: {
      type: 'string',
      enum: ['feature', 'integration', 'fix', 'repair', 'refine', 'lesson', 'harness', 'loop', 'update', 'market'],
    },
    title: text('What changed, verb first, sentence case, no period, no kind prefix'),
    summary: text('What a user or contributor gets, in two or three plain sentences'),
    why: text('One or two sentences: the reason, from the arc, the bug or the failure'),
    cause: text('For fix and repair: the root cause and how it was reproduced; else empty'),
    checked: text('How it was checked: tests added, commands run, rates measured'),
    screenshots: { type: 'array', items: text('Repo path of a committed screenshot on this branch') },
    copy: {
      type: 'array',
      description: 'Every user-facing string this change adds, written as in the code (${…} for interpolations)',
      items: {
        type: 'object',
        properties: { string: text('The string'), why: text('Why the screen needs it') },
        required: ['string', 'why'],
      },
    },
    commitMessage: text('Commit message: a subject line, a blank line, then the why'),
    notes: text('What was learned or left undone, for the loop'),
  },
  required: ['changed', 'kind', 'title', 'summary', 'why', 'cause', 'checked', 'screenshots'],
};
