import { AGENT_COLOR, designerColor } from '../design-system';
import type { AgentFrame } from '../three/viewport/types';
import type { AcpChatMessage } from '../types/robotics';
import { designerPartIds, designerSlots, type DesignerFocus } from '../utils/designers';
import type { AgentCursorState } from './useAgentCursors';

export interface ColoredCursor extends AgentCursorState {
  color: string;
}

const callIdOf = (actor: string) => actor.split('/')[1] ?? '';

export function colorCursors(
  cursors: AgentCursorState[],
  messagesOf: (laneId: string) => AcpChatMessage[],
): ColoredCursor[] {
  const slotsByLane = new Map<string, Map<string, number>>();
  const slotsOf = (laneId: string) => {
    const known = slotsByLane.get(laneId);

    if (known) return known;

    const slots = designerSlots(messagesOf(laneId));

    slotsByLane.set(laneId, slots);

    return slots;
  };

  return cursors.map((cursor) => {
    const [laneId, callId] = cursor.actor.split('/');

    if (!callId) return { ...cursor, color: AGENT_COLOR };

    return { ...cursor, color: designerColor(slotsOf(laneId).get(callId) ?? 0) };
  });
}

export function openedFocus(messages: AcpChatMessage[], callId: string | null): DesignerFocus | null {
  const call = callId ? messages.flatMap((m) => m.toolCalls ?? []).find((c) => c.toolCallId === callId) : undefined;

  if (!call) return null;

  return {
    callId: call.toolCallId,
    color: designerColor(designerSlots(messages).get(call.toolCallId) ?? 0),
    partIds: designerPartIds(call),
  };
}

export function designerFrames(cursors: ColoredCursor[], focus: DesignerFocus | null): AgentFrame[] {
  const live = cursors
    .filter((c) => callIdOf(c.actor) && c.parts.length > 0)
    .map((c) => ({ key: callIdOf(c.actor), color: c.color, partIds: c.parts }));

  if (!focus) return live.map((frame) => ({ ...frame, emphasis: 'normal' }));

  const own = live.find((frame) => frame.key === focus.callId);
  const others = live.filter((frame) => frame !== own).map((frame): AgentFrame => ({ ...frame, emphasis: 'dim' }));
  const partIds = [...new Set([...(own?.partIds ?? []), ...focus.partIds])];

  if (partIds.length === 0) return others;

  return [...others, { key: focus.callId, color: focus.color, partIds, emphasis: 'focus' }];
}
