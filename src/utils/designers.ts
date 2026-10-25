import type { AcpChatMessage, AcpToolCallEvent } from '../types/agentChat';

const DESIGNER_TOOLS = new Set(['agent', 'task']);

const MCP_NAME = /^mcp__.+?__/;

const toolKeyOf = (call: AcpToolCallEvent) => (call.toolName || call.title || '').replace(MCP_NAME, '').toLowerCase();

export const isDesignerCall = (call: AcpToolCallEvent) => DESIGNER_TOOLS.has(toolKeyOf(call));

export const isDesignerRunning = (call: AcpToolCallEvent) => call.status === 'pending' || call.status === 'in_progress';

export function designerSlots(messages: AcpChatMessage[]): Map<string, number> {
  const slots = new Map<string, number>();

  for (const call of messages.flatMap((m) => m.toolCalls ?? [])) {
    if (isDesignerCall(call)) slots.set(call.toolCallId, slots.size);
  }

  return slots;
}

export function designerName(call: AcpToolCallEvent) {
  const description = (call.rawInput as { description?: unknown } | undefined)?.description;

  return typeof description === 'string' && description.trim() ? description.trim() : 'Subagent';
}

type Input = Record<string, unknown>;

const idList = (items: unknown) =>
  Array.isArray(items) ? items.map((item) => (typeof item === 'string' ? item : (item as Input)?.id)) : [];

const mirroredIds = (input: Input) => {
  const rename = input.rename && typeof input.rename === 'object' ? Object.values(input.rename) : [];

  return [...idList(input.ids), ...rename];
};

const WRITTEN_IDS: Record<string, (input: Input) => unknown[]> = {
  model_part: (input) => [input.id],
  add_parts: (input) => idList(input.parts),
  update_parts: (input) => idList(input.updates),
  mirror_parts: mirroredIds,
};

export function designerPartIds(call: AcpToolCallEvent): string[] {
  const ids = new Set<string>();

  for (const child of call.children ?? []) {
    const key = toolKeyOf(child);
    const written = Object.hasOwn(WRITTEN_IDS, key) ? WRITTEN_IDS[key] : undefined;

    if (!written || child.status === 'failed') continue;

    for (const id of written((child.rawInput ?? {}) as Input)) if (typeof id === 'string' && id) ids.add(id);
  }

  return [...ids];
}

export interface DesignerFocus {
  callId: string;
  color: string;
  partIds: string[];
}
