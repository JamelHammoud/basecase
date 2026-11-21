import { EFFICIENCY_OBJECTIVE } from '../outcome.mjs';
import { compareStats } from '../stats.mjs';

export function comparison() {
  const labels = ['working tree', 'main'];
  const results = labels.flatMap((model, arm) =>
    Array.from({ length: 6 }, (_, i) => ({
      model,
      task: `T${i}`,
      seed: 1,
      provider: 'codex',
      effort: 'medium',
      servedBy: 'gpt-6.1-sol',
      status: i === 5 ? 'fail' : 'pass',
      checks: [{ name: 'fit', pass: i !== 5 }],
      tokens: { total: arm ? 200 : 100, cacheRead: 10 },
      seconds: arm ? 12 : 10,
    })),
  );

  return {
    labels,
    results,
    provider: 'codex',
    effort: 'medium',
    resolved: labels.map(() => ({ id: 'gpt-6.1-sol', arg: 'gpt-6.1-sol' })),
    plan: { stop: 'equivalent', tasks: 6, rounds: 1, efficiencyObjective: EFFICIENCY_OBJECTIVE },
    stats: compareStats(results, labels),
  };
}
