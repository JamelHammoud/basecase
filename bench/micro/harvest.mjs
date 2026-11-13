#!/usr/bin/env node
import path from 'node:path';
import { evidenceSources, githubCandidates } from './harvest/github.mjs';
import { existingCoverage, gateFresh } from './harvest/gate.mjs';
import { assignSplits, planHarvest, reportMarkdown, stubFor } from './harvest/plan.mjs';
import { runCandidates } from './harvest/sources.mjs';
import { argOption, here } from '../harness.mjs';
import { closeAppModules, specToPartFn } from './scenes.mjs';
import { writeStub } from './stubs.mjs';
import { ALL_TASKS, HARVESTED_DIR, HARVESTED_TASKS } from './tasks/index.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const args = process.argv.slice(2);
const days = Number(argOption(args, 'days', 14));
const since = argOption(args, 'since', new Date(Date.now() - days * DAY_MS).toISOString());
const runsRoots = argOption(args, 'runs', path.join(here, 'runs'))
  .split(',')
  .map((dir) => path.resolve(dir));
const write = args.includes('--write');

const fromRuns = runsRoots.flatMap((root) => runCandidates(root, since));
const fromGithub = args.includes('--no-github')
  ? { review: [], comment: [] }
  : githubCandidates(evidenceSources(since));
const candidates = [...fromRuns, ...fromGithub.review, ...fromGithub.comment];
const ctx = { studio: null, specToPart: await specToPartFn() };
const covered = await existingCoverage(ALL_TASKS, ctx);
const plan = planHarvest({ candidates, covered, layoutOffset: HARVESTED_TASKS.length });
const gated = await gateFresh(plan.fresh, ctx);
const created = assignSplits(gated.passed, ALL_TASKS);

await closeAppModules();

if (write) for (const entry of created) writeStub(path.join(HARVESTED_DIR, entry.id), stubFor(entry));

const report = reportMarkdown({
  since,
  counts: {
    'bench runs': fromRuns.length,
    'review findings': fromGithub.review.length,
    "Jamel's comments": fromGithub.comment.length,
  },
  created,
  plan: { ...plan, dropped: [...plan.dropped, ...gated.dropped] },
});

console.log(args.includes('--json') ? JSON.stringify({ created: created.map((t) => t.id), report }) : report);
process.exit(0);
