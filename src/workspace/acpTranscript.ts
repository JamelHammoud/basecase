import type { AcpChatMessage, AcpPlanEntry, AcpToolCallEvent } from '../types/robotics';

export type SessionUpdate = Record<string, unknown>;

type Segment = NonNullable<AcpChatMessage['segments']>[number];

const TRANSCRIPT_UPDATES = new Set([
  'agent_thought_chunk',
  'agent_message_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
]);

export const isTranscriptUpdate = (u: SessionUpdate) => TRANSCRIPT_UPDATES.has(String(u.sessionUpdate));

export const emptyAgentMessage = (now: Date): AcpChatMessage => ({
  id: `msg-agent-${now.getTime()}`,
  role: 'agent',
  text: '',
  timestamp: now.toISOString(),
  toolCalls: [],
});

function lastAgentIndex(messages: AcpChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'agent') return i;
  }

  return -1;
}

function targetIndex(messages: AcpChatMessage[], u: SessionUpdate) {
  const last = lastAgentIndex(messages);

  if (u.sessionUpdate !== 'tool_call_update' && u.sessionUpdate !== 'tool_call') return last;

  const id = String(u.toolCallId);
  const owner = messages.findIndex((m) => m.role === 'agent' && m.toolCalls?.some((t) => t.toolCallId === id));

  return owner === -1 ? last : owner;
}

function appendSegment(segments: Segment[] | undefined, type: 'thought' | 'text', chunk: string): Segment[] {
  const segs = [...(segments ?? [])];
  const last = segs[segs.length - 1];

  if (last && last.type === type) segs[segs.length - 1] = { type, text: last.text + chunk };
  else segs.push({ type, text: chunk });

  return segs;
}

const chunkText = (u: SessionUpdate) => (u.content as { text?: string } | undefined)?.text;

function addThought(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  const text = chunkText(u);

  if (!text) return target;

  return {
    ...target,
    thought: (target.thought || '') + text,
    segments: appendSegment(target.segments, 'thought', text),
  };
}

function addText(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  const text = chunkText(u);

  if (!text) return target;

  return { ...target, text: (target.text || '') + text, segments: appendSegment(target.segments, 'text', text) };
}

function addToolCall(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  const meta = u._meta as { claudeCode?: { toolName?: string } } | undefined;
  const id = String(u.toolCallId);
  const call = {
    toolCallId: id,
    title: String(u.title || 'Tool'),
    status: (u.status as AcpToolCallEvent['status']) || 'in_progress',
    kind: String(u.kind || ''),
    rawInput: u.rawInput,
    toolName: meta?.claudeCode?.toolName,
  };
  const list = target.toolCalls || [];

  if (list.some((t) => t.toolCallId === id)) {
    return { ...target, toolCalls: list.map((t) => (t.toolCallId === id ? { ...t, ...call } : t)) };
  }

  return {
    ...target,
    toolCalls: [...list, call],
    segments: [...(target.segments ?? []), { type: 'tool', toolCallId: id }],
  };
}

function updateToolCall(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  const update = (tc: AcpToolCallEvent): AcpToolCallEvent => ({
    ...tc,
    ...(u.title ? { title: String(u.title) } : {}),
    ...(u.rawInput !== undefined ? { rawInput: u.rawInput } : {}),
    status: (u.status as AcpToolCallEvent['status']) || tc.status,
  });

  return {
    ...target,
    toolCalls: (target.toolCalls || []).map((tc) => (tc.toolCallId === String(u.toolCallId) ? update(tc) : tc)),
  };
}

function setPlan(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  if (!Array.isArray(u.entries)) return target;

  return { ...target, plan: (u.entries as AcpPlanEntry[]).map((e) => ({ content: e.content, status: e.status })) };
}

const UPDATERS: Record<string, (target: AcpChatMessage, u: SessionUpdate) => AcpChatMessage> = {
  agent_thought_chunk: addThought,
  agent_message_chunk: addText,
  tool_call: addToolCall,
  tool_call_update: updateToolCall,
  plan: setPlan,
};

export function applySessionUpdate(prev: AcpChatMessage[], u: SessionUpdate, now: Date): AcpChatMessage[] {
  const copy = [...prev];
  let index = targetIndex(copy, u);

  if (index === -1) {
    copy.push(emptyAgentMessage(now));
    index = copy.length - 1;
  }

  const apply = UPDATERS[String(u.sessionUpdate)];

  copy[index] = apply ? apply({ ...copy[index] }, u) : { ...copy[index] };

  return copy;
}

export function markLastAgentStopped(prev: AcpChatMessage[]) {
  const lastAgent = prev.map((m) => m.role).lastIndexOf('agent');

  return prev.map((m, i) => (i === lastAgent ? { ...m, stopped: true } : m));
}

export function chatTitle(messages: AcpChatMessage[]) {
  const firstUser = messages.find((m) => m.role === 'user');

  return (
    firstUser?.text ||
    firstUser?.folderAttachments?.[0]?.name ||
    (firstUser?.imageAttachments?.length ? 'Image build' : 'Chat')
  ).slice(0, 80);
}
