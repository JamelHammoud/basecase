import path from 'node:path';
import { harnessKey } from '../../bench/compare/cache.mjs';
import { BENCH_RUNS, cachedFor, harnessLessons, microArgs, SETTINGS, taskMeta } from './lib/benchRuns.mjs';
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
console.log(`Harness lessons in the playbook: ${harnessLessons().length}.`);

const weakness = pickWeakness({ entries: [...cached.values()].flat(), categoryOf: meta.categoryOf });

console.log(
  weakness
    ? `\n${weaknessMarkdown(weakness, { titleOf: meta.titleOf, settings: SETTINGS, harness })}`
    : '\nNo weakness to pick until the tune baseline has failing runs.',
);
console.log(
  `\nBranch measurement: node ${microArgs({ split: 'tune', seeds: SETTINGS.seeds, name: 'harness-<time>-tune' }).join(' ')}`,
);
