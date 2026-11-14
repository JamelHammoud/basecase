import path from 'node:path';
import { harnessKey } from '../../../bench/compare/cache.mjs';
import { appendExperiment, readExperiments } from '../../../bench/experiments.mjs';
import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import {
  agentLessons,
  BENCH_RUNS,
  ensureRuns,
  failedChecks,
  openDetached,
  runCompare,
  runDir,
  SETTINGS,
  spentOn,
  taskMeta,
  unlinkRuns,
} from '../lib/benchRuns.mjs';
import { openPulls, repoVariable } from '../lib/github.mjs';
import {
  budgetFrom,
  confirmHeldout,
  decide,
  experimentFields,
  measuredMarkdown,
  skipReason,
} from '../lib/harnessVerdict.mjs';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { pause } from '../lib/usage.mjs';
import { pickWeakness, recentCategories, weaknessMarkdown } from '../lib/weakness.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: "Finds where the CAD agent does worst on the micro-evals, changes its harness, and keeps it only if it's measured better",
};

const MAX_FAILURES = 12;
const tried = store('harness', { tried: [] });

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

const git = (dir, args) => run('git', args, { cwd: dir }).out;

const nulList = (out) => out.split('\0').filter(Boolean);

const changedPaths = (dir) => [
  ...nulList(git(dir, ['diff', '--name-only', '--no-renames', '-z', 'HEAD'])),
  ...nulList(git(dir, ['ls-files', '--others', '--exclude-standard', '-z'])),
];

export const touchesBench = (paths) => paths.filter((file) => file.startsWith('bench/'));

const failureLine = (entry) => {
  const dir = runDir(entry);

  return dir
    ? `- ${entry.task} seed ${entry.seed}: \`bench/runs/${path.relative(BENCH_RUNS, dir)}\`. Failed: ${failedChecks(dir)}`
    : `- ${entry.task} seed ${entry.seed} (run ${entry.run}): its folder is gone`;
};

const listOr = (lines) => lines.join('\n') || 'None.';

const promptFor = ({ weakness, meta, harness }) =>
  [
    weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness }),
    `## Failing runs\n\nEach folder holds \`events.jsonl\` (the agent's transcript), \`answer.md\`, \`grade.json\`, \`start.json\` and \`scene.json\`.\n\n${weakness.tasks
      .flatMap((task) => task.failures)
      .slice(0, MAX_FAILURES)
      .map(failureLine)
      .join('\n')}`,
    `## Lessons about the agent (docs/Lessons playbook.md)\n\n${listOr(agentLessons().map((l) => `- ${l.id}: ${l.title}`))}`,
    `## Changes already measured (bench/experiments.md)\n\n${listOr(
      readExperiments().map((e) => `- ${e.id}: ${e.title} [${e.tags.join(', ')}]`),
    )}`,
    "Diagnose why the agent fails these tasks and change its harness to fix the cause, following your brief. The runner measures your change on the tune set and then the held-out set against main's numbers above.",
  ].join('\n\n');

const usagePaused = () => skipReason({ paused: pause(), pulls: [] });

function measureBranch({ worktree, mainSha, budget, log }) {
  const name = `harness-${stamp()}`;
  const compare = (split) => {
    const measured = runCompare({
      dir: worktree.dir,
      log,
      against: mainSha,
      split,
      budget: budget.left,
      name: `${name}-${split}`,
    });

    budget.left -= measured?.spent ?? 0;

    return measured;
  };
  const tune = compare('tune');
  const first = decide({ tune: tune?.stats });

  if (first.verdict !== 'confirm') return { tune, decision: first };

  if (usagePaused() || budget.left <= 0)
    return { tune, decision: { verdict: 'inconclusive', reason: 'no usage or budget left for the held-out set' } };

  log(`${first.reason}; confirming on the held-out set with $${budget.left.toFixed(2)} left`);

  const heldout = compare('heldout');

  return { tune, heldout, decision: confirmHeldout({ tune: tune.stats, heldout: heldout?.stats }) };
}

const usedRuns = ({ tune, heldout }) => [...new Set([...(tune?.runs ?? []), ...(heldout?.runs ?? [])])].sort();

function recordExperiment({ worktree, weakness, change, decision, runs }) {
  appendExperiment(
    path.join(worktree.dir, 'bench', 'experiments.md'),
    experimentFields({ weakness, change, decision, runs }),
  );
}

function recordNull({ worktree, weakness, change, decision, runs, log }) {
  git(worktree.dir, ['reset', '-q', '--hard', 'HEAD']);
  git(worktree.dir, ['clean', '-fdq']);
  recordExperiment({ worktree, weakness, change, decision, runs });

  const url = publish(
    {
      changed: true,
      kind: 'lesson',
      title: `Record a harness change for ${weakness.category} that didn't measure better`,
      summary: experimentFields({ weakness, change, decision, runs }).lesson,
      why: `The harness lane tried it against ${weakness.category}, the agent's weakest micro-eval category, and the bench didn't keep it.`,
      cause: '',
      checked: `Measured by the harness lane with bench/compare.mjs --against; runs: ${runs.join(', ')}.`,
      screenshots: [],
    },
    worktree,
  );

  log(url ? `discarded (${decision.reason}); recorded in ${url}` : `discarded (${decision.reason}); nothing opened`);
}

function sessionChange({ worktree, weakness, meta, harness, log }) {
  const prompt = promptFor({ weakness, meta, harness: harness.main });
  const result = runAgent({ cwd: worktree.dir, name: 'harness', prompt, schema: CHANGE_SCHEMA, hours: 6 });

  if (!result.ok) {
    log(`harness session failed: ${String(result.error).slice(0, 500)}`);

    return null;
  }

  if (!result.output.changed) {
    log(`no change: ${result.output.notes}`);

    return null;
  }

  const graders = touchesBench(changedPaths(worktree.dir));

  if (graders.length > 0) {
    log(`the session changed the bench (${graders.slice(0, 5).join(', ')}); nothing measured`);

    return null;
  }

  return result.output;
}

function pickAndChange({ worktree, base, log }) {
  const meta = taskMeta();
  const harness = { main: harnessKey(base.dir) };
  const baselineRun = `harness-${stamp()}-main-tune`;
  const baseline = ensureRuns({
    dir: base.dir,
    harness: harness.main,
    split: 'tune',
    ids: meta.tune,
    name: baselineRun,
    log,
  });
  const recent = recentCategories(tried.get('recent').tried, { now: Date.now() });
  const weakness = pickWeakness({ entries: [...baseline.values()].flat(), categoryOf: meta.categoryOf, recent });

  if (!weakness) return log(`no tune task fails on main's harness ${harness.main}`);

  log(`weakest: ${weakness.category} at ${Math.round(weakness.rate * 100)}%`);
  tried.update('recent', (state) => ({
    tried: [...state.tried, { category: weakness.category, at: new Date().toISOString() }].slice(-20),
  }));

  const change = sessionChange({ worktree, weakness, meta, harness, log });

  if (!change) return null;

  harness.branch = harnessKey(worktree.dir);

  if (harness.branch === harness.main)
    return log('the change touches nothing the agent depends on (HARNESS_PATHS); nothing measured');

  return { meta, harness, weakness, change, baselineRun };
}

function attempt({ worktree, base, budget, log }) {
  const picked = pickAndChange({ worktree, base, log });

  if (!picked) return;

  const { meta, harness, weakness, change, baselineRun } = picked;

  budget.left -= spentOn(baselineRun);

  if (usagePaused() || budget.left <= 0)
    return log(`stopping before measuring: ${usagePaused() ?? 'the budget is spent'}`);

  const mainSha = git(base.dir, ['rev-parse', 'HEAD']);
  const measured = measureBranch({ worktree, mainSha, budget, log });
  const runs = usedRuns(measured);
  const { decision } = measured;

  unlinkRuns(worktree.dir);

  if (decision.verdict === 'discard') return recordNull({ worktree, weakness, change, decision, runs, log });

  if (decision.verdict !== 'keep') return log(`nothing recorded: ${decision.reason}`);

  recordExperiment({ worktree, weakness, change, decision, runs });

  const extra = {
    weakness: weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness: harness.main }),
    measured: measuredMarkdown({ ...measured, settings: SETTINGS, harness, runs }),
  };
  const url = publish({ ...change, kind: 'harness' }, { ...worktree, extra });

  log(url ? `kept (${decision.reason}); opened ${url}` : 'kept, but nothing was published');
}

export default function harness({ log }) {
  const skip = skipReason({ paused: pause(), pulls: openPulls({ fresh: true }) });

  if (skip) return log(skip);

  const budget = { left: budgetFrom(repoVariable('LOOP_BENCH_BUDGET')) };
  const worktree = openBranch('harness', 'weakness');
  const base = openDetached(`harness-main-${process.pid}`, git(worktree.dir, ['rev-parse', 'HEAD']));

  try {
    attempt({ worktree, base, budget, log });
  } finally {
    unlinkRuns(worktree.dir);
    unlinkRuns(base.dir);
    close(base);
    close(worktree);
  }
}
