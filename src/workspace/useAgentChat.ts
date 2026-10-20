import type { AcpChatMessage, AgentConversation } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { chatTitle } from './acpTranscript';
import { MAIN_LANE, laneOfChat, laneToDrop, MAX_LANES, newLaneId, type AgentLane } from './agentLanes';
import { attempt } from './helpers';
import type { StudioShared, WorkspaceSeed } from './types';
import type { AgentLanes } from './useAgentLanes';
import type { WorkspaceCore } from './useWorkspaceCore';

interface AgentChatOptions {
  core: WorkspaceCore;
  lanes: AgentLanes;
  stop: (id: string) => void;
  persistLane: (id: string) => void;
}

const LANES_FULL = `Up to ${MAX_LANES} chats run at once. Stop one to start another.`;

export function saveChat(
  setChatList: StudioShared['setChatList'],
  { id, messages, sessionId }: { id: string | null; messages: AcpChatMessage[]; sessionId: string | null },
) {
  if (!id || !messages.length) return;

  platformBridge
    .saveChat({
      id,
      title: chatTitle(messages),
      acpSessionId: sessionId,
      createdAt: messages[0]?.timestamp ?? new Date().toISOString(),
      messages,
    })
    .then(setChatList)
    .catch(() => {});
}

export function lanePersister(lanes: AgentLanes, setChatList: StudioShared['setChatList']) {
  return (id: string) => {
    const lane = lanes.lanesRef.current.find((l) => l.id === id);

    if (lane) saveChat(setChatList, { id: lane.chatId, messages: lane.messages, sessionId: lane.acpSessionId });
  };
}

export function useAgentChat({ core, lanes, stop, persistLane }: AgentChatOptions) {
  const { workspaceId, studio, showToast } = core;
  const { focusChat, setChatList } = studio;
  const { flagsOf, keyOf, updateLane, selectLane } = lanes;

  const dropLane = (id: string) => {
    lanes.removeLane(id);
    platformBridge.closeAcpWorkspace(keyOf(id)).catch(() => {});
  };

  const closeLane = (lane: AgentLane) => {
    persistLane(lane.id);
    dropLane(lane.id);
  };

  const freeLane = () => {
    const list = lanes.lanesRef.current;
    const { id } = lanes.current;

    if (!flagsOf(id).busy) return id;

    const blank = list.find((l) => !flagsOf(l.id).busy && l.messages.length === 0);

    if (blank) return blank.id;

    const drop = laneToDrop(
      list.filter((l) => l.id !== MAIN_LANE),
      id,
    );

    if (list.length >= MAX_LANES && !drop) return null;

    if (drop) closeLane(drop);

    const made = newLaneId();

    lanes.addLane(made);

    return made;
  };

  const loadLane = async (id: string, conv: AgentConversation | null) => {
    const flags = flagsOf(id);

    flags.pendingResume = null;
    updateLane(id, (l) => ({
      ...l,
      chatId: conv?.id ?? null,
      messages: conv?.messages ?? [],
      edits: {},
      status: '',
    }));
    selectLane(id);

    const resumeId = conv?.acpSessionId;
    const status = await attempt(() =>
      resumeId ? platformBridge.resumeAcp(resumeId, keyOf(id)) : platformBridge.newAcpConversation(keyOf(id)),
    );

    if (status.ok && status.value.sessionId) updateLane(id, (l) => ({ ...l, acpSessionId: status.value.sessionId }));
  };

  const withFreeLane = (run: (id: string) => Promise<void>) => {
    const id = freeLane();

    if (!id) {
      showToast(LANES_FULL, { tone: 'neutral' });

      return Promise.resolve();
    }

    return run(id);
  };

  const newChat = () => withFreeLane((id) => loadLane(id, null));

  const openChat = async (chatId: string) => {
    const local = laneOfChat(lanes.lanesRef.current, chatId);

    if (local) {
      selectLane(local.id);

      return;
    }

    if (focusChat(chatId, workspaceId)) return;

    const conv = await platformBridge.getChat(chatId);

    if (conv) await withFreeLane((id) => loadLane(id, conv));
  };

  const deleteChat = async (chatId: string) => {
    setChatList(await platformBridge.deleteChat(chatId));

    const lane = laneOfChat(lanes.lanesRef.current, chatId);

    if (!lane) return;

    if (flagsOf(lane.id).busy) stop(lane.id);

    if (lane.id === lanes.currentId || lane.id === MAIN_LANE) await loadLane(lane.id, null);
    else dropLane(lane.id);
  };

  const restore = (chat: WorkspaceSeed['chat']) => {
    lanes.lanesRef.current
      .filter((l) => l.id !== MAIN_LANE)
      .forEach((l) => platformBridge.closeAcpWorkspace(keyOf(l.id)).catch(() => {}));
    lanes.resetLanes(chat);
  };

  const chatSnapshot = () => {
    const { chatId, messages, acpSessionId, id } = lanes.current;

    return messages.length ? { chatId, messages, acpSessionId: acpSessionId ?? flagsOf(id).pendingResume } : undefined;
  };

  return {
    newChat,
    openChat,
    deleteChat,
    restore,
    persistAll: () => lanes.lanesRef.current.forEach((l) => persistLane(l.id)),
    chatSnapshot,
    chatIds: lanes.lanes.flatMap((l) => (l.chatId ? [l.chatId] : [])),
  };
}

export type AgentChat = ReturnType<typeof useAgentChat>;
