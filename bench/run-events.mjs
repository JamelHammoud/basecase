const SESSION_COUNTERS = new Map([
  ['agent_thought_chunk', 'thoughtChunks'],
  ['agent_message_chunk', 'messageChunks'],
]);

function countToolCall(u, { counts, log }) {
  counts.toolCalls++;

  const name = u._meta?.claudeCode?.toolName ?? u.title ?? '';

  if (/model_part/.test(name)) counts.modelPart++;

  log('tool', name.replace('mcp__robotics_cad__', ''), u.rawInput?.id ?? u.rawInput?.name ?? '');
}

function countSessionUpdate(u, { counts, log }) {
  if (u.sessionUpdate === 'tool_call') {
    countToolCall(u, { counts, log });

    return;
  }

  if (u.sessionUpdate === 'tool_call_update' && u.status === 'failed') {
    counts.failedTools++;

    return;
  }

  const key = SESSION_COUNTERS.get(u.sessionUpdate);

  if (key) counts[key]++;
}

export function createEventHandler({ counts, log, logFile, started }) {
  const write = (record) => logFile.write(JSON.stringify(record) + '\n');

  return (ev) => {
    if (ev.type === 'agent-request') {
      write({
        t: Date.now() - started,
        type: ev.type,
        kind: ev.kind,
        ids: (ev.payload?.ops ?? []).map((o) => o.part?.id ?? o.id ?? o.ids),
      });

      return;
    }

    write({ t: Date.now() - started, ...ev });

    const u = ev.update;

    if (ev.type === 'acp-session-update' && u) countSessionUpdate(u, { counts, log });
    else if (ev.type === 'agent-status') log('status', ev.status);
    else if (ev.type === 'agent-blocked') log('blocked', ev.title);
  };
}

function parseSseChunk(chunk) {
  const line = chunk.split('\n').find((l) => l.startsWith('data: '));

  if (!line) return undefined;

  try {
    return JSON.parse(line.slice(6));
  } catch {
    return undefined;
  }
}

export function sseDataReader(onEvent) {
  let buf = '';

  return (value) => {
    buf += value;

    for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
      const ev = parseSseChunk(buf.slice(0, i));

      buf = buf.slice(i + 2);

      if (ev !== undefined) onEvent(ev);
    }
  };
}
