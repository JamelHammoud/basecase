import path from 'node:path';
import { harnessKey } from '../../../bench/compare/cache.mjs';
import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import {
  BENCH_RUNS,
  cachedFor,
  ensureRuns,
  failedChecks,
  harnessLessons,
  openDetached,
  runDir,
  runMicro,
  SETTINGS,
  taskMeta,
  unlinkRuns,
} from '../lib/benchRuns.mjs';
import { decide, lessonFields, measure, measuredMarkdown } from '../lib/harnessVerdict.mjs';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { store } from '../lib/store.mjs';
import { pickWeakness, recentCategories, runsOf, weaknessMarkdown } from '../lib/weakness.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 12 * 60 * 60,
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

const lessonLines = () =>
  harnessLessons()
    .map((lesson) => `- ${lesson.id}: ${lesson.title}`)
    .join('\n') || 'None.';

const promptFor = ({ weakness, meta, harness }) =>
  [
    weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness }),
    `## Failing runs\n\nEach folder holds \`events.jsonl\` (the agent's transcript), \`answer.md\`, \`grade.json\`, \`start.json\` and \`scene.json\`.\n\n${weakness.tasks
      .flatMap((task) => task.failures)
      .slice(0, MAX_FAILURES)
      .map(failureLine)
      .join('\n')}`,
    `## Harness changes already tried (docs/Lessons playbook.md)\n\n${lessonLines()}`,
    "Diagnose why the agent fails these tasks and change its harness to fix the cause, following your brief. The runner measures your change on the whole tune set and the held-out set against main's numbers above.",
  ].join('\n\n');

function measureBranch({ worktree, base, meta, harness, baseline, log }) {
  const name = `harness-${stamp()}`;

  runMicro({ dir: worktree.dir, log, split: 'tune', seeds: SETTINGS.seeds, name: `${name}-tune` });

  const tune = measure({ main: baseline, branch: cachedFor(harness.branch), ids: meta.tune, seeds: SETTINGS.seeds });
  const first = decide({ tune });

  if (first.verdict !== 'confirm') return { tune, decision: first };

  log(`${first.reason}; confirming on the held-out set`);

  const mainHeld = ensureRuns({
    dir: base.dir,
    harness: harness.main,
    split: 'heldout',
    ids: meta.heldout,
    name: `${name}-main-heldout`,
    log,
  });

  runMicro({ dir: worktree.dir, log, split: 'heldout', seeds: SETTINGS.seeds, name: `${name}-heldout` });

  const branchRuns = cachedFor(harness.branch);
  const heldout = measure({ main: mainHeld, branch: branchRuns, ids: meta.heldout, seeds: SETTINGS.seeds });

  return { tune, heldout, decision: decide({ tune, heldout }) };
}

const usedRuns = (harness) =>
  [...new Set([...runsOf(cachedFor(harness.main)), ...runsOf(cachedFor(harness.branch))])].sort();

function recordLesson({ worktree, weakness, change, decision, runs, log }) {
  git(worktree.dir, ['reset', '-q', '--hard', 'HEAD']);
  git(worktree.dir, ['clean', '-fdq']);

  const fields = lessonFields({ weakness, change, decision, runs });
  const add = ['add', '--title', fields.title, '--lesson', fields.lesson];

  run(
    process.execPath,
    ['bench/playbook.mjs', ...add, '--evidence', fields.evidence.join(','), '--tags', fields.tags.join(',')],
    { cwd: worktree.dir },
  );

  const url = publish(
    {
      changed: true,
      kind: 'lesson',
      title: `Record a harness change for ${weakness.category} that didn't measure better`,
      summary: fields.lesson,
      why: `The harness lane tried it against ${weakness.category}, the agent's weakest micro-eval category, and the bench didn't keep it.`,
      cause: '',
      checked: `Measured by the harness lane on the micro-eval tune set; runs: ${runs.join(', ')}.`,
      changelog: '',
      screenshots: [],
    },
    worktree,
  );

  log(url ? `discarded (${decision.reason}); lesson ${url}` : `discarded (${decision.reason}); no lesson opened`);
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

function attempt({ worktree, base, log }) {
  const meta = taskMeta();
  const harness = { main: harnessKey(base.dir) };
  const baseline = ensureRuns({
    dir: base.dir,
    harness: harness.main,
    split: 'tune',
    ids: meta.tune,
    name: `harness-${stamp()}-main-tune`,
    log,
  });
  const recent = recentCategories(tried.get('recent').tried, { now: Date.now() });
  const weakness = pickWeakness({ entries: [...baseline.values()].flat(), categoryOf: meta.categoryOf, recent });

  if (!weakness) {
    log(`no tune task fails on main's harness ${harness.main}`);

    return;
  }

  log(`weakest: ${weakness.category} at ${Math.round(weakness.rate * 100)}%`);
  tried.update('recent', (state) => ({
    tried: [...state.tried, { category: weakness.category, at: new Date().toISOString() }].slice(-20),
  }));

  const change = sessionChange({ worktree, weakness, meta, harness, log });

  if (!change) return;

  harness.branch = harnessKey(worktree.dir);

  if (harness.branch === harness.main) {
    log('the change touches nothing the agent depends on (HARNESS_PATHS); nothing measured');

    return;
  }

  const measured = measureBranch({ worktree, base, meta, harness, baseline, log });
  const runs = usedRuns(harness);

  unlinkRuns(worktree.dir);

  if (measured.decision.verdict !== 'keep') {
    recordLesson({ worktree, weakness, change, decision: measured.decision, runs, log });

    return;
  }

  const extra = {
    weakness: weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness: harness.main }),
    measured: measuredMarkdown({ ...measured, settings: SETTINGS, harness, runs }),
  };
  const url = publish({ ...change, kind: 'harness' }, { ...worktree, extra });

  log(url ? `kept (${measured.decision.reason}); opened ${url}` : 'kept, but nothing was published');
}

export default function harness({ log }) {
  const worktree = openBranch('harness', 'weakness');
  const base = openDetached(`harness-main-${process.pid}`, git(worktree.dir, ['rev-parse', 'HEAD']));

  try {
    attempt({ worktree, base, log });
  } finally {
    unlinkRuns(worktree.dir);
    unlinkRuns(base.dir);
    close(base);
    close(worktree);
  }
}
