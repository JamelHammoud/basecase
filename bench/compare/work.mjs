const measured = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function measurement(runs, read, successes) {
  const values = runs.map(read).filter(measured);
  const total = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  const missing = runs.length - values.length;

  return {
    total,
    missing,
    perSuccessfulTask: successes && !missing && total !== null ? total / successes : null,
  };
}

function scopeWork(runs) {
  const successfulTasks = new Set(runs.filter((run) => run.status === 'pass').map((run) => run.task)).size;

  return {
    attempts: runs.length,
    successfulTasks,
    tokens: measurement(runs, (run) => run.tokens?.total, successfulTasks),
    cachedInputTokens: measurement(runs, (run) => run.tokens?.cacheRead, successfulTasks),
    seconds: measurement(runs, (run) => run.seconds, successfulTasks),
    toolCalls: measurement(runs, (run) => run.toolCalls, successfulTasks),
  };
}

export const workSummary = (runs) => ({
  all: scopeWork(runs),
  live: scopeWork(runs.filter((run) => !run.cached)),
  reused: scopeWork(runs.filter((run) => run.cached)),
});
