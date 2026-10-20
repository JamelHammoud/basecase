import type { AcpChatMessage, CustomModelDefinition } from '../types/robotics';
import { platformBridge, type AcpPromptPayload } from '../utils/platformBridge';
import { emptyAgentMessage, markLastAgentStopped } from './acpTranscript';
import { marksNote } from '../agent/agentMarks';
import type { ActorIndex } from './agentActors';
import { buildAgentPrompt, type AgentSendParams } from './agentPrompt';
import { newId } from './helpers';
import type { AgentCursors } from './useAgentCursors';
import type { AgentLanes } from './useAgentLanes';
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

    if (res.stopReason === 'cancelled') setMessages(id, markLastAgentStopped);
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
      showToast(`Agent error. ${String((err as Error).message ?? err)}`, { tone: 'error' });
    }
  };

  const runAgentPrompt = async (id: string, first: AcpPromptPayload) => {
    let payload: AcpPromptPayload | undefined = first;

    setBusy(id, true);
    updateLane(id, (l) => ({ ...l, edits: {} }));

    while (payload) {
      await runOnce(id, payload);

      const next = alive() ? flagsOf(id).queued.shift() : undefined;

      if (next) {
        const fresh = emptyAgentMessage(new Date());

        setMessages(id, (prev) => [...prev.map((m) => (m.id === next.messageId ? { ...m, queued: false } : m)), fresh]);
      }

      payload = next?.payload;
    }

    setBusy(id, false);
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
    const note = marksNote(docs.projectRef.current.marks, docs.partsRef.current);
    const { payload, userMessage, agentMessage } = buildAgentPrompt({ ...params, note }, new Date());

    if (flagsOf(id).busy) {
      await steer(id, payload, [userMessage, agentMessage]);

      return;
    }

    if (!chatId) updateLane(id, (l) => ({ ...l, chatId: newId('chat') }));

    setMessages(id, (prev) => [...prev, userMessage, agentMessage]);
    await runAgentPrompt(id, payload);
  };

  return { send };
}
