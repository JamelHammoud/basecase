import crypto from 'node:crypto';

const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(value) ?? 'null')
    .digest('hex');
const READS = new Set([
  'get_scene',
  'get_part_code',
  'read_evidence',
  'list_evidence',
  'get_bom',
  'get_readiness',
  'check_assembly',
  'check_scene',
]);
const CHECKS = new Set(['get_readiness', 'check_assembly', 'check_scene']);

function toolStart(u, t) {
  const wrapped = typeof u.rawInput?.server === 'string' && typeof u.rawInput?.tool === 'string';
  const name = wrapped ? u.rawInput.tool : (u._meta?.claudeCode?.toolName ?? u.toolName ?? u.title ?? '');
  const input = wrapped ? u.rawInput.arguments : u.rawInput;

  return {
    name: String(name)
      .replace(/^mcp__\w+?__/, '')
      .replace(/^mcp\.[\w-]+\./, ''),
    input: input === undefined ? null : hash(input),
    started: t,
  };
}

const outputOf = (u) => u.rawOutput ?? u.content ?? u._meta?.claudeCode?.toolResponse;

const durationOf = (start, end) =>
  Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
const toolEnd = (call, u, t) => ({
  ...call,
  output: outputOf(u) === undefined ? null : hash(outputOf(u)),
  failed: u.status === 'failed',
  duration: durationOf(call.started, t),
});

function completedCalls(records) {
  const pending = new Map();
  const completed = [];

  for (const record of records) {
    const u = record.update;

    if (record.type !== 'acp-session-update' || !u?.toolCallId) continue;

    if (u.sessionUpdate === 'tool_call') {
      pending.set(u.toolCallId, toolStart(u, record.t));
    }

    if (u.sessionUpdate !== 'tool_call_update' || !['completed', 'failed'].includes(u.status)) continue;

    const call = pending.get(u.toolCallId);

    if (!call) continue;

    completed.push(toolEnd(call, u, record.t));
    pending.delete(u.toolCallId);
  }

  return completed;
}

function addPattern(patterns, kind, calls) {
  const tools = calls.map((call) => call.name);
  const key = `${kind}/${tools.join('/')}`;
  const pattern = patterns.get(key) ?? { kind, tools, frequency: 0, milliseconds: 0, missingDurations: 0 };

  pattern.frequency++;

  for (const call of calls) {
    pattern.milliseconds += Math.max(0, call.duration ?? 0);
    pattern.missingDurations += call.duration === null ? 1 : 0;
  }

  patterns.set(key, pattern);
}

const sameCall = (a, b) => a.input !== null && a.name === b.name && a.input === b.input;

function recordFailures(patterns, failed, call) {
  if (!call.failed) {
    failed.length = 0;

    return;
  }

  failed.push(call);

  const pair = failed.slice(-4);

  if (pair.length !== 4 || !sameCall(pair[0], pair[2]) || !sameCall(pair[1], pair[3])) return;

  addPattern(patterns, 'unsuccessful-sequence', pair.slice(2));
  failed.length = 0;
}

export function wastePatterns(records) {
  const patterns = new Map();
  const reads = new Map();
  const failed = [];

  for (const call of completedCalls(records)) {
    const signature = `${call.name}/${call.input}/${call.output}`;

    recordFailures(patterns, failed, call);

    if (!READS.has(call.name)) {
      reads.clear();

      continue;
    }

    if (call.failed || call.output === null || call.input === null) continue;

    if (reads.has(signature)) addPattern(patterns, CHECKS.has(call.name) ? 'unchanged-check' : 'repeated-read', [call]);

    reads.set(signature, true);
  }

  return [...patterns.values()];
}
