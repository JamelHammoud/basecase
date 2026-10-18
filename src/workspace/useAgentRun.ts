import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { AcpChatMessage, CustomModelDefinition } from '../types/robotics';
import { platformBridge, type AcpPromptPayload } from '../utils/platformBridge';
import { emptyAgentMessage, markLastAgentStopped } from './acpTranscript';
import { buildAgentPrompt, type AgentSendParams } from './agentPrompt';
import { newId } from './helpers';
import type { Vec3 } from './types';
import type { AgentChat } from './useAgentChat';
import type { WorkspaceCore } from './useWorkspaceCore';

interface AgentRunOptions {
  core: WorkspaceCore;
  chat: AgentChat;
  active: boolean;
  placeCustomModel: (model: CustomModelDefinition) => void;
}

interface QueuedPrompt {
  messageId: string;
  payload: AcpPromptPayload;
}

type PromptResult = Awaited<ReturnType<typeof platformBridge.sendAcpPrompt>>;

function useRunFlags() {
  const busyRef = useRef(false);
  const followRef = useRef(true);
  const aliveRef = useRef(true);
  const queuedRef = useRef<QueuedPrompt[]>([]);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  return { busyRef, followRef, aliveRef, queuedRef };
}

export function useAgentRun({ core, chat, active, placeCustomModel }: AgentRunOptions) {
  const { workspaceId, studio, docs, showToast, scene, undo } = core;
  const { setAcpSessionId, setMessages, setRunBase, takePendingResume, setChatId, persist } = chat;
  const { setCustomModels, notify } = studio;
  const { commitParts, partsRef } = docs;
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [action, setAction] = useState('');
  const [cursorTarget, setCursorTarget] = useState<Vec3 | null>(null);
  const { busyRef, followRef, aliveRef, queuedRef } = useRunFlags();
  const wasBusyRef = useRef(false);

  const resumeSession = async (resume: string) => {
    const resumed = await platformBridge.resumeAcp(resume, workspaceId).catch(() => null);

    if (resumed?.sessionId) setAcpSessionId(resumed.sessionId);
  };

  const applyResult = (res: PromptResult, modelCountBefore: number) => {
    const models = Array.isArray(res.models) ? res.models : null;

    if (res.sessionId) setAcpSessionId(res.sessionId);

    if (models) setCustomModels(models);

    if (models && models.length > modelCountBefore) placeCustomModel(models[0]);

    if (res.stopReason === 'cancelled') setMessages(markLastAgentStopped);
  };

  const runOnce = async (payload: AcpPromptPayload) => {
    busyRef.current = true;
    setIsBusy(true);
    setStatus('');
    followRef.current = true;
    setRunBase(partsRef.current);

    try {
      const resume = takePendingResume();

      if (resume) await resumeSession(resume);

      const modelCountBefore = (await platformBridge.listModels().catch(() => [])).length;

      applyResult(await platformBridge.sendAcpPrompt({ ...payload, workspaceId }), modelCountBefore);
    } catch (err) {
      showToast(`Agent error. ${String((err as Error).message ?? err)}`, { tone: 'error' });
    }
  };

  const runAgentPrompt = async (first: AcpPromptPayload) => {
    let payload: AcpPromptPayload | undefined = first;

    while (payload) {
      await runOnce(payload);

      const next = aliveRef.current ? queuedRef.current.shift() : undefined;

      if (next) {
        const fresh = emptyAgentMessage(new Date());

        setMessages((prev) => [...prev.map((m) => (m.id === next.messageId ? { ...m, queued: false } : m)), fresh]);
      }

      payload = next?.payload;
    }

    busyRef.current = false;
    setIsBusy(false);
    setStatus('');
  };

  const steer = async (payload: AcpPromptPayload, userMessage: AcpChatMessage, agentMessage: AcpChatMessage) => {
    const outcome = await platformBridge.steerAcp({ ...payload, workspaceId });

    if (outcome === 'injected') {
      setMessages((prev) => [...prev, userMessage, agentMessage]);

      return;
    }

    queuedRef.current.push({ messageId: userMessage.id, payload });
    setMessages((prev) => [...prev, { ...userMessage, queued: true }]);
  };

  const send = async (params: AgentSendParams) => {
    const { payload, userMessage, agentMessage } = buildAgentPrompt(params, new Date());

    if (busyRef.current) {
      await steer(payload, userMessage, agentMessage);

      return;
    }

    if (!chat.chatId) setChatId(newId('chat'));

    setMessages((prev) => [...prev, userMessage, agentMessage]);
    await runAgentPrompt(payload);
  };

  const stop = () => {
    const dropped = new Set(queuedRef.current.map((q) => q.messageId));

    queuedRef.current = [];

    if (dropped.size)
      setMessages((prev) => prev.map((m) => (dropped.has(m.id) ? { ...m, queued: false, notSent: true } : m)));

    platformBridge.cancelAcp(workspaceId).catch(() => {});
  };

  const revert = () => {
    const base = chat.runBase;

    if (!base) return;

    commitParts(() => base);
    setRunBase(null);
    showToast('Reverted agent changes', { action: { label: 'Undo', onClick: undo } });
  };

  const onRunFinished = useEffectEvent(() => {
    persist();

    if (!active && aliveRef.current) notify(workspaceId, `Agent finished in ${scene.sceneName}`);
  });

  useEffect(() => {
    if (wasBusyRef.current && !isBusy) onRunFinished();

    wasBusyRef.current = isBusy;
  }, [isBusy]);

  return {
    isBusy,
    status,
    setStatus,
    action,
    setAction,
    cursorTarget,
    setCursorTarget,
    send,
    stop,
    revert,
    stopFollowing: () => {
      followRef.current = false;
    },
    isFollowing: () => followRef.current,
  };
}

export type AgentRun = ReturnType<typeof useAgentRun>;
