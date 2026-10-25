import { toolIdentity } from './toolIdentity';
import type { AcpChatMessage, AcpPlanEntry, AcpToolCallEvent, ContextUsage } from '../types/robotics';
import { parentToolUseIdOf } from './agentActors';

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

export function contextFromUpdate(u: SessionUpdate): ContextUsage | null {
  if (u.sessionUpdate !== 'usage_update' || parentToolUseIdOf(u)) return null;

  const { used, size, cost } = u as { used?: unknown; size?: unknown; cost?: { amount?: unknown; currency?: unknown } };

  if (typeof used !== 'number' || typeof size !== 'number' || size <= 0) return null;

  const costUsd = cost?.currency === 'USD' && typeof cost.amount === 'number' ? cost.amount : undefined;

  return { used, size, ...(costUsd !== undefined ? { costUsd } : {}) };
}

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

function newCall(u: SessionUpdate): AcpToolCallEvent {
  const { toolName, rawInput } = toolIdentity(u);

  return {
    toolCallId: String(u.toolCallId),
    title: String(u.title || 'Tool'),
    status: (u.status as AcpToolCallEvent['status']) || 'in_progress',
    kind: String(u.kind || ''),
    rawInput,
    toolName,
  };
}

function patchCall(tc: AcpToolCallEvent, u: SessionUpdate): AcpToolCallEvent {
  const identity = toolIdentity(u);

  return {
    ...tc,
    ...(u.title ? { title: String(u.title) } : {}),
    ...(u.rawInput !== undefined ? { rawInput: identity.rawInput } : {}),
    ...(!tc.toolName && identity.toolName ? { toolName: identity.toolName } : {}),
    status: (u.status as AcpToolCallEvent['status']) || tc.status,
  };
}

function upsertCall(list: AcpToolCallEvent[], u: SessionUpdate) {
  const id = String(u.toolCallId);

  if (u.sessionUpdate === 'tool_call_update') return list.map((t) => (t.toolCallId === id ? patchCall(t, u) : t));

  const call = newCall(u);

  if (list.some((t) => t.toolCallId === id)) return list.map((t) => (t.toolCallId === id ? { ...t, ...call } : t));

  return [...list, call];
}

function addToolCall(target: AcpChatMessage, u: SessionUpdate): AcpChatMessage {
  const id = String(u.toolCallId);
  const list = target.toolCalls || [];
  const known = list.some((t) => t.toolCallId === id);

  return {
    ...target,
    toolCalls: upsertCall(list, u),
    segments: known ? target.segments : [...(target.segments ?? []), { type: 'tool', toolCallId: id }],
  };
}

const updateToolCall = (target: AcpChatMessage, u: SessionUpdate): AcpChatMessage => ({
  ...target,
  toolCalls: upsertCall(target.toolCalls || [], u),
});

const NESTED_TEXT: Record<string, 'childText' | 'childThought'> = {
  agent_message_chunk: 'childText',
  agent_thought_chunk: 'childThought',
};

function nestUpdate(call: AcpToolCallEvent, u: SessionUpdate): AcpToolCallEvent {
  const kind = String(u.sessionUpdate);
  const field = Object.hasOwn(NESTED_TEXT, kind) ? NESTED_TEXT[kind] : undefined;

  if (field) {
    const text = chunkText(u);

    return text ? { ...call, [field]: (call[field] ?? '') + text } : call;
  }

  if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') {
    return { ...call, children: upsertCall(call.children ?? [], u) };
  }

  return call;
}

function applySubagentUpdate(prev: AcpChatMessage[], parentId: string, u: SessionUpdate) {
  const owner = prev.findLastIndex((m) => m.toolCalls?.some((t) => t.toolCallId === parentId));

  if (owner === -1) return prev;

  const copy = [...prev];
  const msg = copy[owner];

  copy[owner] = {
    ...msg,
    toolCalls: msg.toolCalls?.map((t) => (t.toolCallId === parentId ? nestUpdate(t, u) : t)),
  };

  return copy;
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
  const parentId = parentToolUseIdOf(u);

  if (parentId) return applySubagentUpdate(prev, parentId, u);

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

function patchLastAgent(prev: AcpChatMessage[], patch: Partial<AcpChatMessage>) {
  const lastAgent = lastAgentIndex(prev);

  return prev.map((m, i) => (i === lastAgent ? { ...m, ...patch } : m));
}

export const markLastAgentStopped = (prev: AcpChatMessage[]) => patchLastAgent(prev, { stopped: true });

export const markLastAgentFailed = (reason: string) => (prev: AcpChatMessage[]) =>
  patchLastAgent(prev, { failed: reason });

const hasContent = (m: AcpChatMessage) => !!(m.segments?.length || m.plan?.length || m.text || m.toolCalls?.length);

export function clearFailedReply(prev: AcpChatMessage[]) {
  const last = prev[prev.length - 1];

  if (last?.role !== 'agent' || !last.failed) return prev;

  return hasContent(last) ? [...prev.slice(0, -1), { ...last, failed: undefined }] : prev.slice(0, -1);
}

export function chatTitle(messages: AcpChatMessage[]) {
  const firstUser = messages.find((m) => m.role === 'user');

  return (
    firstUser?.text ||
    firstUser?.folderAttachments?.[0]?.name ||
    (firstUser?.imageAttachments?.length ? 'Image build' : 'Chat')
  ).slice(0, 80);
}
