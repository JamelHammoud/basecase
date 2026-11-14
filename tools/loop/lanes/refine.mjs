import { CHANGE_SCHEMA } from '../lib/agent.mjs';
import { issues, openPulls } from '../lib/github.mjs';
import { inFlight, inFlightText } from '../lib/inFlight.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { checkedRun } from '../lib/preflight.mjs';
import { kindOf, publish, pullTitle } from '../lib/pull.mjs';
import { ideaOf, mergedRefines, pullNumberOf, recentRefinesText, refineIdeas } from '../lib/refines.mjs';
import { run } from '../lib/sh.mjs';
import { heldBy, stepAreas, stepAreasText } from '../lib/stepAreas.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 2,
  everySeconds: 60,
  does: 'Lands one refinement everywhere it holds, in one pull request',
};

const STEP_LABELS = ['loop:next', 'loop:building'];

const ownedSteps = () => {
  const mine = STEP_LABELS.flatMap((label) => issues(label)).filter((issue) => issue.author?.login === OWNER_LOGIN);

  return [...new Map(mine.map((issue) => [issue.number, issue])).values()]
    .sort((a, b) => a.number - b.number)
    .map(stepAreas);
};

const openRefines = () => openPulls().filter((pull) => kindOf(pull.title) === 'refine');

const lines = (args, dir) => run('git', args, { cwd: dir }).out.split('\n').filter(Boolean);

const changedFiles = (dir) => [
  ...new Set([
    ...lines(['diff', '--name-only', '--merge-base', 'origin/main'], dir),
    ...lines(['ls-files', '--others', '--exclude-standard'], dir),
  ]),
];

export const LIVE = {
  inFlight,
  ownedSteps,
  openRefines,
  mergedRefines,
  ideas: refineIdeas,
  checkedRun,
  publish,
  changedFiles,
  openBranch,
  close,
};

export function refinePrompt({ taken, steps, refines }) {
  return [
    'Pick one refinement of Basecase and land it everywhere it holds, following your brief.',
    `These pull requests are open or merged in the last day. Pick something none of them already changes:\n\n${taken}`,
    `These steps are waiting to be built or being built. The files and guide sections each one names are its area; pick something outside them:\n\n${steps}`,
    `These refinements are open or merged in the last 14 days. Don't pick one of their ideas again; if one reached only some places, finish it everywhere in one pull request:\n\n${refines}`,
  ].join('\n\n');
}

export const promptFor = (deps) =>
  refinePrompt({
    taken: inFlightText(deps.inFlight()),
    steps: stepAreasText(deps.ownedSteps()),
    refines: recentRefinesText({ open: deps.openRefines(), merged: deps.mergedRefines(), ideas: deps.ideas.all() }),
  });

function publishUnlessHeld(output, { worktree, log, deps }) {
  const held = heldBy(deps.changedFiles(worktree.dir), deps.ownedSteps());

  if (held) {
    log(`not publishing: every file it changes belongs to step #${held.number} (${held.title})`);

    return null;
  }

  const change = { ...output, kind: 'refine' };
  const url = deps.publish(change, worktree);
  const number = pullNumberOf(url);

  if (number) deps.ideas.save(number, { title: pullTitle(change), idea: ideaOf(output.summary), at: Date.now() });

  log(url ? `opened ${url}` : `no change: ${output.notes}`);

  return url;
}

export default function refine({ log }, deps = LIVE) {
  const worktree = deps.openBranch('refine', 'fit');

  try {
    const result = deps.checkedRun({
      cwd: worktree.dir,
      name: 'refine',
      prompt: promptFor(deps),
      schema: CHANGE_SCHEMA,
      hours: 6,
      kind: 'refine',
      log,
    });

    if (!result.ok) {
      log(`refine session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    if (!result.output.changed) {
      log(`no change: ${result.output.notes}`);

      return;
    }

    publishUnlessHeld(result.output, { worktree, log, deps });
  } finally {
    deps.close(worktree);
  }
}
