import type { AcpChatMessage, CustomModelDefinition } from '../types/robotics';
import { platformBridge, type AcpPromptPayload } from '../utils/platformBridge';
import { clearFailedReply, emptyAgentMessage, markLastAgentFailed, markLastAgentStopped } from './acpTranscript';
import { marksNote } from '../agent/agentMarks';
import type { ActorIndex } from './agentActors';
import { buildAgentPrompt, resendPayload, type AgentSendParams, type PromptOptions } from './agentPrompt';
import { newId } from './helpers';
import { STOPPED_REASONS } from './liveRuns';
import type { AgentCursors } from './useAgentCursors';
import type { AgentLanes, QueuedPrompt } from './useAgentLanes';
import type { WorkspaceCore } from './useWorkspaceCore';

interface AgentRunOptions {
  core: WorkspaceCore;
  lanes: AgentLanes;
  actors: ActorIndex;
  cursors: AgentCursors;
  alive: () => boolean;
  placeCustomModel: (model: CustomModelDefinition) => void;
}

type PromptResult = Awaited<ReturnType<typeof platformBridge.sendAcpPrompt>>;

const failureReason = (err: unknown) =>
  String((err as Error)?.message ?? err ?? '')
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^(Error: )+/, '')
    .trim() || 'The agent stopped responding.';

export function useAgentRun({ core, lanes, actors, cursors, alive, placeCustomModel }: AgentRunOptions) {
  const { docs, showToast } = core;
  const { setCustomModels } = core.studio;
  const { updateLane, setMessages, flagsOf, keyOf } = lanes;

  const setSession = (id: string, sessionId: string) => updateLane(id, (l) => ({ ...l, acpSessionId: sessionId }));

  const setBusy = (id: string, busy: boolean) => {
    flagsOf(id).busy = busy;
    updateLane(id, (l) => ({ ...l, busy, status: '' }));
  };

  const resumeSession = async (id: string, resume: string) => {
    const resumed = await platformBridge.resumeAcp(resume, keyOf(id)).catch(() => null);

    if (resumed?.sessionId) setSession(id, resumed.sessionId);
  };

  const applyResult = (id: string, res: PromptResult, modelCountBefore: number) => {
    const models = Array.isArray(res.models) ? res.models : null;

    if (res.sessionId) setSession(id, res.sessionId);

    if (models) setCustomModels(models);

    if (models && models.length > modelCountBefore) placeCustomModel(models[0]);

    if (STOPPED_REASONS.has(res.stopReason)) setMessages(id, markLastAgentStopped);
  };

  const runOnce = async (id: string, payload: AcpPromptPayload) => {
    const flags = flagsOf(id);
    const resume = flags.pendingResume;

    flags.follow = true;
    flags.pendingResume = null;
    updateLane(id, (l) => ({ ...l, status: '' }));

    try {
      if (resume) await resumeSession(id, resume);

      const modelCountBefore = (await platformBridge.listModels().catch(() => [])).length;

      applyResult(id, await platformBridge.sendAcpPrompt({ ...payload, workspaceId: keyOf(id) }), modelCountBefore);
    } catch (err) {
      const reason = failureReason(err);

      setMessages(id, markLastAgentFailed(reason));
      showToast(`Agent error. ${reason}`, { tone: 'error' });
    }
  };

  const dequeue = (id: string, next: QueuedPrompt): AcpPromptPayload => {
    const fresh = emptyAgentMessage(new Date());
    const lane = lanes.lanesRef.current.find((l) => l.id === id);
    const user = lane?.messages.find((m) => m.id === next.messageId);
    const sent = user ? [{ ...user, queued: false }, fresh] : [fresh];

    setMessages(id, (prev) => [...prev.map((m) => (m.id === next.messageId ? { ...m, queued: false } : m)), fresh]);

    return lane?.chatId ? { ...next.payload, run: { chatId: lane.chatId, messages: sent } } : next.payload;
  };

  const runAgentPrompt = async (id: string, first: AcpPromptPayload) => {
    let payload: AcpPromptPayload | undefined = first;

    setBusy(id, true);
    updateLane(id, (l) => ({ ...l, edits: {} }));

    while (payload) {
      await runOnce(id, payload);

      const next = alive() ? flagsOf(id).queued.shift() : undefined;

      payload = next && dequeue(id, next);
    }

    setBusy(id, false);
    void platformBridge.forgetAcpRun(keyOf(id));
    actors.endLane(id);
    cursors.clearLane(id);
  };

  const steer = async (id: string, payload: AcpPromptPayload, sent: [AcpChatMessage, AcpChatMessage]) => {
    const [userMessage, agentMessage] = sent;
    const outcome = await platformBridge.steerAcp({ ...payload, workspaceId: keyOf(id) });

    if (outcome === 'injected') {
      setMessages(id, (prev) => [...prev, userMessage, agentMessage]);

      return;
    }

    flagsOf(id).queued.push({ messageId: userMessage.id, payload });
    setMessages(id, (prev) => [...prev, { ...userMessage, queued: true }]);
  };

  const send = async (params: AgentSendParams) => {
    const { id, chatId } = lanes.current;
    const chat = chatId ?? newId('chat');
    const note = marksNote(docs.projectRef.current.marks, docs.partsRef.current);
    const built = buildAgentPrompt({ ...params, note }, new Date());
    const { userMessage, agentMessage } = built;
    const payload = { ...built.payload, run: { chatId: chat, messages: [userMessage, agentMessage] } };

    if (flagsOf(id).busy) {
      await steer(id, payload, [userMessage, agentMessage]);

      return;
    }

    if (!chatId) updateLane(id, (l) => ({ ...l, chatId: chat }));

    setMessages(id, (prev) => [...prev, userMessage, agentMessage]);
    await runAgentPrompt(id, payload);
  };

  const retry = async (options: Omit<PromptOptions, 'note'>) => {
    const { id, messages, chatId } = lanes.current;
    const user = messages.findLast((m) => m.role === 'user' && !m.queued && !m.notSent);

    if (flagsOf(id).busy || !user) return;

    const note = marksNote(docs.projectRef.current.marks, docs.partsRef.current);
    const fresh = emptyAgentMessage(new Date());
    const payload = resendPayload(user, { ...options, note });

    setMessages(id, (prev) => [...clearFailedReply(prev), fresh]);
    await runAgentPrompt(id, chatId ? { ...payload, run: { chatId, messages: [fresh] } } : payload);
  };

  const drain = async (id: string) => {
    const next = flagsOf(id).queued.shift();

    if (next && !flagsOf(id).busy) await runAgentPrompt(id, dequeue(id, next));
  };

  return { send, retry, drain };
}
