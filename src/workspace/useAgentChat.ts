import { useRef, useState } from 'react';
import type { AcpChatMessage, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { chatTitle } from './acpTranscript';
import { attempt } from './helpers';
import type { StudioShared, WorkspaceSeed } from './types';

interface AgentChatOptions {
  workspaceId: string;
  seed?: WorkspaceSeed;
  studio: StudioShared;
}

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

export function useAgentChat({ workspaceId, seed, studio }: AgentChatOptions) {
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AcpChatMessage[]>(seed?.chat?.messages ?? []);
  const [chatId, setChatId] = useState<string | null>(seed?.chat?.chatId ?? null);
  const [runBase, setRunBase] = useState<ScenePart[] | null>(null);
  const pendingResumeRef = useRef<string | null>(seed?.chat?.acpSessionId ?? null);
  const { focusChat, setChatList } = studio;

  const takePendingResume = () => {
    const resume = pendingResumeRef.current;

    pendingResumeRef.current = null;

    return resume;
  };

  const newChat = async () => {
    setMessages([]);
    setChatId(null);
    setRunBase(null);
    pendingResumeRef.current = null;

    const started = await attempt(() => platformBridge.newAcpConversation(workspaceId));

    if (started.ok) setAcpSessionId(started.value.sessionId);
  };

  const openChat = async (id: string) => {
    if (focusChat(id, workspaceId)) return;

    const conv = await platformBridge.getChat(id);

    if (!conv) return;

    setChatId(conv.id);
    setMessages(conv.messages);
    setRunBase(null);
    pendingResumeRef.current = null;

    const resumeId = conv.acpSessionId;
    const status = await attempt(() =>
      resumeId ? platformBridge.resumeAcp(resumeId, workspaceId) : platformBridge.newAcpConversation(workspaceId),
    );

    if (status.ok) setAcpSessionId(status.value.sessionId);
  };

  const deleteChat = async (id: string) => {
    setChatList(await platformBridge.deleteChat(id));

    if (id === chatId) void newChat();
  };

  const persist = () => saveChat(setChatList, { id: chatId, messages, sessionId: acpSessionId });

  const chatSnapshot = () =>
    messages.length ? { chatId, messages, acpSessionId: acpSessionId ?? pendingResumeRef.current } : undefined;

  return {
    acpSessionId,
    setAcpSessionId,
    messages,
    setMessages,
    chatId,
    setChatId,
    runBase,
    setRunBase,
    takePendingResume,
    newChat,
    openChat,
    deleteChat,
    persist,
    chatSnapshot,
  };
}

export type AgentChat = ReturnType<typeof useAgentChat>;
