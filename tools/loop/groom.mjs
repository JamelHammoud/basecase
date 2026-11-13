import { groomQueue } from './lanes/groom.mjs';

const target = (decision) => {
  if (decision?.action === 'close') return ` (#${decision.pull})`;

  return decision?.action === 'fold' ? ` (into #${decision.into})` : '';
};

const outcomes = groomQueue({ log: (line) => console.error(line), dry: true });

for (const action of ['rewrite', 'close', 'fold', 'keep']) {
  const rows = outcomes.filter((outcome) => outcome.action === action);

  console.log(`\n## ${action} (${rows.length})\n`);

  for (const { number, outcome, decision } of rows) {
    console.log(`- #${number}${target(decision)}: ${outcome}. ${decision?.reason ?? ''}`);
  }
}
