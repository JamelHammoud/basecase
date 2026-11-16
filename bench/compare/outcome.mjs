import { servedMismatch } from './models.mjs';
import { bootstrapCI } from './stats.mjs';
import { workSummary } from './work.mjs';

const eligibleStop = (result) => !result?.error && ['winner', 'rounds', 'equivalent'].includes(result?.plan?.stop);

function completeRows({ results, labels, resolved, stats, plan, provider }) {
  if (resolved?.length !== 2 || resolved[0].id !== resolved[1].id) return false;

  const keys = new Set(results.map((run) => `${run.model}/${run.task}/${run.seed}`));
  const tasks = new Set(stats.paired.map((task) => task.task));

  return (
    keys.size === plan.tasks * plan.rounds * 2 &&
    results.every(
      (run) =>
        (!provider || run.provider === provider) &&
        tasks.has(run.task) &&
        labels.includes(run.model) &&
        Number.isInteger(run.seed) &&
        run.seed >= 1 &&
        run.seed <= plan.rounds &&
        ['pass', 'fail'].includes(run.status) &&
        !run.timedOut &&
        !!run.servedBy &&
        !servedMismatch(resolved[labels.indexOf(run.model)], run.servedBy),
    )
  );
}

export function completeComparison(result) {
  const { stats, plan, results, labels } = result ?? {};

  if (!eligibleStop(result) || labels?.[0] !== 'working tree' || labels.length !== 2) return false;

  if (!stats?.models || stats.models.length !== 2 || stats.models.some((model) => model.errors || model.unavailable))
    return false;

  if (stats.paired.length < 5 || stats.paired.length !== plan.tasks) return false;

  return results?.length === plan.tasks * plan.rounds * 2 && completeRows(result);
}

export const heldoutWin = (result) =>
  completeComparison(result) && result.plan.stop === 'winner' && result.stats.stopCi?.[0] > 0;

export const EFFICIENCY_OBJECTIVE = 'total-tokens-per-successful-task-99-paired-no-duration-increase-v1';

const checksOf = (run) => {
  if (!run.checks?.length || run.checks.some((check) => typeof check.pass !== 'boolean' || !check.name)) return null;

  const checks = run.checks.map(({ name, pass }) => [name, pass]).sort(([a], [b]) => a.localeCompare(b));

  if (new Set(checks.map(([name]) => name)).size !== checks.length) return null;

  return JSON.stringify(checks);
};

function sameResults(result) {
  const [a, b] = result.labels.map((label) => result.results.filter((run) => run.model === label));
  const baseline = new Map(b.map((run) => [`${run.task}/${run.seed}`, run]));

  return a.every((run) => {
    const pair = baseline.get(`${run.task}/${run.seed}`);
    const checks = checksOf(run);

    return (
      pair &&
      checks &&
      checks === checksOf(pair) &&
      run.status === pair.status &&
      run.effort === result.effort &&
      pair.effort === result.effort
    );
  });
}

function efficiency(result) {
  if (result.plan.efficiencyObjective !== EFFICIENCY_OBJECTIVE)
    return { outcome: 'inconclusive', reason: 'Efficiency objective was not frozen before measurement.' };

  if (!result.provider || result.results.some((run) => run.provider !== result.provider) || !sameResults(result))
    return { outcome: 'loss', reason: 'Paired statuses, individual checks or effort differ or are unavailable.' };

  const work = result.labels.map((label) => workSummary(result.results.filter((run) => run.model === label)).all);

  if (
    work.some(
      (arm) => !arm.successfulTasks || arm.tokens.perSuccessfulTask === null || arm.seconds.perSuccessfulTask === null,
    )
  )
    return { outcome: 'inconclusive', reason: 'Token or duration measurements are missing, or no task succeeded.' };

  const tasks = result.stats.paired.map(({ task }) => {
    const arms = result.labels.map(
      (label) => workSummary(result.results.filter((run) => run.model === label && run.task === task)).all,
    );

    return { tokens: arms[1].tokens.total - arms[0].tokens.total, successes: arms[0].successfulTasks };
  });
  const reduction = (sample) => {
    const successes = sample.reduce((sum, task) => sum + task.successes, 0);

    return successes ? sample.reduce((sum, task) => sum + task.tokens, 0) / successes : -Infinity;
  };
  const tokenCi = bootstrapCI(tasks, { level: 0.99, statistic: reduction });
  const tokenReduction = work[1].tokens.perSuccessfulTask - work[0].tokens.perSuccessfulTask;
  const durationIncrease = work[0].seconds.perSuccessfulTask - work[1].seconds.perSuccessfulTask;
  const outcome = tokenCi?.[0] > 0 && durationIncrease <= 0 ? 'efficiency-win' : 'inconclusive';

  return {
    outcome,
    tokenReduction,
    tokenCi,
    durationIncrease,
    reason:
      'Total tokens include failed attempts and cached input. Token savings are not measured subscription allowance savings.',
  };
}

export function comparisonOutcome(result) {
  if (!completeComparison(result))
    return { outcome: 'incomplete', reason: 'Complete paired results and verified identities are required.' };

  if (heldoutWin(result))
    return { outcome: 'quality-win', reason: 'Pass-rate improvement has a positive 99% paired interval.' };

  return efficiency(result);
}
