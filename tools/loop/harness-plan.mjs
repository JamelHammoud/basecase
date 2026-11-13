import path from 'node:path';
import { harnessKey } from '../../bench/compare/cache.mjs';
import { readExperiments } from '../../bench/experiments.mjs';
import { agentLessons, BENCH_RUNS, cachedFor, compareArgs, microArgs, SETTINGS, taskMeta } from './lib/benchRuns.mjs';
import { repoVariable } from './lib/github.mjs';
import { budgetFrom } from './lib/harnessVerdict.mjs';
import { CODE_ROOT } from './lib/paths.mjs';
import { pickWeakness, runsOf, shortfall, weaknessMarkdown } from './lib/weakness.mjs';

const checkout = path.resolve(process.argv[2] ?? CODE_ROOT);
const meta = taskMeta();
const harness = harnessKey(checkout);
const cached = cachedFor(harness);

const plan = (split, ids) => {
  const missing = shortfall(cached, ids, SETTINGS.seeds);
  const have = ids.length - missing.tasks.length;
  const command = missing.tasks.length
    ? `node ${microArgs({ split, tasks: missing.tasks, seeds: missing.seeds, name: `harness-<time>-main-${split}` }).join(' ')}`
    : 'nothing to run';

  return `${split}: ${have} of ${ids.length} tasks have ${SETTINGS.seeds} cached runs. Baseline: ${command}`;
};

console.log(`Checkout ${checkout}, harness ${harness}.`);
console.log(`Runs and index: ${BENCH_RUNS}.`);
console.log(
  `Model ${SETTINGS.model} (expects ${SETTINGS.served}), effort ${SETTINGS.effort}, ${SETTINGS.seeds} seeds, ${SETTINGS.parallel} slots.`,
);
console.log(plan('tune', meta.tune));
console.log(plan('heldout', meta.heldout));
console.log(`Reused runs: ${runsOf(cached).join(', ') || 'none'}.`);
console.log(
  `Lessons in the playbook: ${agentLessons().length}. Changes already measured: ${readExperiments().length}.`,
);

const weakness = pickWeakness({ entries: [...cached.values()].flat(), categoryOf: meta.categoryOf });

console.log(
  weakness
    ? `\n${weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness })}`
    : '\nNo weakness to pick until the tune baseline has failing runs.',
);

const budget = budgetFrom(repoVariable('LOOP_BENCH_BUDGET'));
const measure = (split) =>
  `node ${compareArgs({ against: '<main>', split, budget, name: `harness-<time>-${split}` }).join(' ')}`;

console.log(`\nBudget per run: $${budget} (LOOP_BENCH_BUDGET), the baseline's runs included.`);
console.log(`Branch measurement: ${measure('tune')}`);
console.log(`Then, if tune improves: ${measure('heldout')}`);
