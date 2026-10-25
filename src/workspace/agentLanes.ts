import type { AcpChatMessage, AgentConversationSummary, ContextUsage, ScenePart } from '../types/robotics';
import { chatTitle } from './acpTranscript';

export const MAIN_LANE = 'main';
export const MAX_LANES = 4;

const LANE_SEPARATOR = '__';

export type RunEdits = Record<string, ScenePart | null>;

export interface AgentLane {
  id: string;
  chatId: string | null;
  messages: AcpChatMessage[];
  acpSessionId: string | null;
  busy: boolean;
  status: string;
  edits: RunEdits;
  usedAt: number;
  context: ContextUsage | null;
}

export interface LaneChat {
  chatId: string | null;
  messages: AcpChatMessage[];
  acpSessionId: string | null;
  context?: ContextUsage | null;
}

export const laneKey = (workspaceId: string, laneId: string) =>
  laneId === MAIN_LANE ? workspaceId : `${workspaceId}${LANE_SEPARATOR}${laneId}`;

export function splitLaneKey(key: string) {
  const [workspaceId, laneId] = key.split(LANE_SEPARATOR);

  return { workspaceId, laneId: laneId || MAIN_LANE };
}

export const newLaneId = () => `lane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function newLane(id: string, chat?: LaneChat): AgentLane {
  return {
    id,
    chatId: chat?.chatId ?? null,
    messages: chat?.messages ?? [],
    acpSessionId: chat?.acpSessionId ?? null,
    busy: false,
    status: '',
    edits: {},
    usedAt: Date.now(),
    context: chat?.context ?? null,
  };
}

export function laneToDrop(lanes: AgentLane[], currentId: string): AgentLane | null {
  if (lanes.length < MAX_LANES) return null;

  const idle = lanes.filter((l) => !l.busy && l.id !== currentId).sort((a, b) => a.usedAt - b.usedAt);

  return idle[0] ?? null;
}

export const laneOfChat = (lanes: AgentLane[], chatId: string) => lanes.find((l) => l.chatId === chatId) ?? null;

export const isBlankLane = (lane: AgentLane) => !lane.busy && lane.messages.length === 0;

export function runningChats(lanes: AgentLane[], now: Date): AgentConversationSummary[] {
  return lanes
    .filter((l) => l.busy && l.chatId)
    .map((l) => ({
      id: l.chatId as string,
      title: chatTitle(l.messages),
      updatedAt: now.toISOString(),
      messageCount: l.messages.length,
    }));
}

export function canRevertLane(lane: AgentLane) {
  return !lane.busy && Object.keys(lane.edits).length > 0 && lane.messages.at(-1)?.role === 'agent';
}
