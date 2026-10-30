import fs from 'node:fs';

const isSubagent = (u) => !!u?._meta?.claudeCode?.parentToolUseId;
const toolNameOf = (u) =>
  String(u._meta?.claudeCode?.toolName ?? u.toolName ?? u.title ?? '').replace(/^mcp__\w+?__/, '');

export function readEvents(file) {
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

const sessionUpdates = (records) =>
  records.filter((r) => r.type === 'acp-session-update' && r.update).map((r) => r.update);

function usageOf(updates) {
  const main = updates.filter((u) => u.sessionUpdate === 'usage_update' && !isSubagent(u));
  const last = main[main.length - 1];
  const costs = main.map((u) => (u.cost?.currency === 'USD' ? Number(u.cost.amount) : NaN)).filter(Number.isFinite);

  return {
    costUsd: costs.length ? Math.round(Math.max(...costs) * 10000) / 10000 : null,
    contextUsed: typeof last?.used === 'number' ? last.used : null,
    contextSize: typeof last?.size === 'number' ? last.size : null,
  };
}

function toolCounts(updates) {
  const byName = {};
  const failed = new Set();
  let total = 0;
  let subagentCalls = 0;

  for (const u of updates) {
    if (u.sessionUpdate === 'tool_call_update' && u.status === 'failed') failed.add(u.toolCallId);

    if (u.sessionUpdate !== 'tool_call') continue;

    const name = toolNameOf(u) || 'unknown';

    byName[name] = (byName[name] ?? 0) + 1;
    total++;
    subagentCalls += isSubagent(u) ? 1 : 0;
  }

  return { total, byName, failed: failed.size, subagentCalls };
}

export function tokensOf(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return {
    input: n(usage.inputTokens),
    output: n(usage.outputTokens),
    cacheRead: n(usage.cachedReadTokens),
    cacheWrite: n(usage.cachedWriteTokens),
    total: n(usage.totalTokens),
  };
}

export function answerText(records) {
  return sessionUpdates(records)
    .filter((u) => u.sessionUpdate === 'agent_message_chunk' && !isSubagent(u))
    .map((u) => (u.content?.type === 'text' ? u.content.text : ''))
    .join('');
}

export function runMetrics(records, { result = {}, seconds } = {}) {
  const updates = sessionUpdates(records);
  const tools = toolCounts(updates);
  const lastT = records.reduce((m, r) => Math.max(m, Number(r.t) || 0), 0);

  return {
    seconds: seconds ?? Math.round(lastT / 1000),
    stopReason: result.stopReason ?? result.error ?? null,
    ...usageOf(updates),
    tokens: tokensOf(result.usage),
    toolCalls: tools.total,
    toolsByName: tools.byName,
    failedTools: tools.failed,
    subagentToolCalls: tools.subagentCalls,
  };
}
