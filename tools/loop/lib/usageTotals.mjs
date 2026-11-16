const measuredNumber = (value) => Number.isFinite(value) && value >= 0;
const measuredValue = (value) => (measuredNumber(value) ? value : 0);

export const tokenCount = (usage) =>
  measuredValue(usage?.input_tokens) +
  measuredValue(usage?.output_tokens) +
  measuredValue(usage?.cache_read_input_tokens) +
  measuredValue(usage?.cache_creation_input_tokens);

export const cachedInputTokens = (usage) =>
  measuredValue(usage?.cached_input_tokens) + measuredValue(usage?.cache_read_input_tokens);

const measuredUsage = (usage, provider) => {
  const keys = ['input_tokens', 'output_tokens'];

  if (provider === 'claude') keys.push('cache_read_input_tokens', 'cache_creation_input_tokens');

  return keys.every((key) => measuredNumber(usage?.[key]));
};

const measuredCachedInput = (usage) =>
  ['cached_input_tokens', 'cache_read_input_tokens'].some((key) => measuredNumber(usage?.[key]));

const missingMeasurement = (record, measured) =>
  !measured(record.usage, record.provider) ||
  ((record.previousUsage !== undefined || record.formatRetried) && !measured(record.previousUsage, record.provider));

export function sessionTotals(records) {
  const missingUsage = records.filter((record) => missingMeasurement(record, measuredUsage)).length;
  const missingCachedInput = records.filter((record) => missingMeasurement(record, measuredCachedInput)).length;
  const missingElapsed = records.filter((record) => !measuredNumber(record.durationMs)).length;
  const measuredCachedInputTokens = records.reduce(
    (total, record) => total + cachedInputTokens(record.usage) + cachedInputTokens(record.previousUsage),
    0,
  );
  const measuredTokens = records.reduce(
    (total, record) => total + tokenCount(record.usage) + tokenCount(record.previousUsage),
    0,
  );
  const measuredMilliseconds = records.reduce((total, record) => total + measuredValue(record.durationMs), 0);

  return {
    sessions: records.length,
    completedSessions: records.filter((record) => record.state === 'completed').length,
    failedAttempts: records.filter((record) => record.ok === false).length,
    revisions: records.filter((record) => (record.lane ?? record.name) === 'revise').length,
    tokens: missingUsage ? null : measuredTokens,
    measuredTokens,
    missingUsage,
    cachedInputTokens: missingCachedInput ? null : measuredCachedInputTokens,
    measuredCachedInputTokens,
    missingCachedInput,
    milliseconds: missingElapsed ? null : measuredMilliseconds,
    measuredMilliseconds,
    missingElapsed,
  };
}
