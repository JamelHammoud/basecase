import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { BENCH_RUNS } from '../lib/benchRuns.mjs';
import { evidenceCount, evidenceText, gatherEvidence, isLoopPull } from '../lib/evidence.mjs';
import {
  DAY_MS,
  digestWorst,
  issueComments,
  lineComments,
  mainCommits,
  pullsSince,
  windowStart,
} from '../lib/history.mjs';
import { OWNER_LOGIN } from '../lib/paths.mjs';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { worstSection } from '../lib/stats.mjs';
import { store } from '../lib/store.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: 'Turns mistakes seen twice, or once by Jamel, into a lint, test, guide rule or playbook entry, and harvests micro-eval tasks weekly',
};

const MAX_EVIDENCE = 300_000;
const HARVEST_DAYS = 7;
const harvests = store('learn', { harvestedAt: null });

const openLessons = (pulls) =>
  pulls
    .filter((p) => p.state === 'OPEN' && isLoopPull(p, OWNER_LOGIN) && p.headRefName.startsWith('loop/learn/'))
    .map((p) => `- #${p.number} ${p.title}\n${p.body ?? ''}`);

function weekOfEvidence() {
  const since = windowStart(7);
  const pulls = pullsSince(since);
  const comments = [...issueComments(since), ...lineComments(since)];
  const evidence = gatherEvidence({ comments, pulls, commits: mainCommits(since), since, owner: OWNER_LOGIN });

  return { since, pulls, evidence, worst: digestWorst() };
}

const promptFor = ({ since, pulls, evidence, worst, harvest }) =>
  [
    `What went wrong in Basecase's loop since ${since}. Find each mistake that happened at least twice, or that Jamel pointed out once, and turn it into the strongest fix that fits, following your brief.`,
    ...worstSection(worst, 'Propose one lesson aimed at it, traced to the evidence below that explains it.'),
    ...(harvest ? [`## This week's micro-eval harvest\n\n${harvest}`] : []),
    `## Lessons already open, don't repeat them\n\n${openLessons(pulls).join('\n\n') || 'None.'}`,
    evidenceText(evidence, pulls).slice(0, MAX_EVIDENCE),
  ].join('\n\n');

export function harvestDue(harvestedAt, now = Date.now()) {
  return !harvestedAt || now - Date.parse(harvestedAt) >= HARVEST_DAYS * DAY_MS;
}

const harvestChange = (created, report) => {
  const title = `Add ${created.length} micro-eval task${created.length === 1 ? '' : 's'} from the week's missed checks and findings`;

  return {
    changed: true,
    kind: 'refine',
    title,
    summary: `The weekly harvest adds ${created.join(', ')} to the micro-evals, each a planted fault built in code and graded by the check that caught it in a real run, review or comment.`,
    why: `The micro-evals only measure the failures they were written from. The learn lane's weekly harvest (bench/micro/harvest.mjs) turns this week's misses into tasks; it runs from tools/loop/lanes/learn.mjs, a protected path.`,
    cause: '',
    checked: report,
    screenshots: [],
    commitMessage: `${title}\n\nbench/micro/harvest.mjs found faults an agent check missed, or a review or Jamel named, that no micro-eval covered. Each new task passed dry-run: its start fails the grader and its known fix passes.`,
  };
};

function harvestWeek({ log }) {
  const worktree = openBranch('learn', 'micro-eval-harvest');

  try {
    const args = ['bench/micro/harvest.mjs', '--days', String(HARVEST_DAYS), '--runs', BENCH_RUNS, '--write', '--json'];
    const { created, report } = JSON.parse(run('node', args, { cwd: worktree.dir }).out.trim().split('\n').at(-1));

    harvests.save('harvest', { harvestedAt: new Date().toISOString() });

    if (!created.length) {
      log('harvest: no new micro-eval tasks');

      return report;
    }

    const url = publish(harvestChange(created, report), worktree);

    log(url ? `harvest: opened ${url}` : `harvest: ${created.length} tasks, nothing published`);

    return report;
  } catch (error) {
    log(`harvest failed: ${String(error?.message ?? error).slice(0, 500)}`);

    return null;
  } finally {
    close(worktree);
  }
}

export default function learn({ log }) {
  const harvest = harvestDue(harvests.get('harvest').harvestedAt) ? harvestWeek({ log }) : null;
  const week = { ...weekOfEvidence(), harvest };

  if (evidenceCount(week.evidence) === 0 && !week.worst) {
    log('nothing to learn from this week');

    return;
  }

  const worktree = openBranch('learn', 'lessons');

  try {
    const result = runAgent({
      cwd: worktree.dir,
      name: 'learn',
      prompt: promptFor(week),
      schema: CHANGE_SCHEMA,
      hours: 4,
    });

    if (!result.ok) {
      log(`learn session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const url = publish({ ...result.output, kind: 'lesson' }, worktree);

    log(url ? `opened ${url}` : `no lesson: ${result.output.notes}`);
  } finally {
    close(worktree);
  }
}
