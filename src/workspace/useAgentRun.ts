import type { AcpChatMessage, CustomModelDefinition } from '../types/robotics';
import { platformBridge, type AcpPromptPayload } from '../utils/platformBridge';
import { errorMessage } from '../utils/errorMessage';
import { clearFailedReply, emptyAgentMessage, markLastAgentFailed, markLastAgentStopped } from './acpTranscript';
import { marksNote } from '../agent/agentMarks';
import type { ActorIndex } from './agentActors';
import {
  buildAgentPrompt,
  joinNotes,
  resendPayload,
  runningCaseNote,
  type AgentSendParams,
  type PromptOptions,
} from './agentPrompt';
import { newId } from './helpers';
import { readinessGate } from './readinessGate';
import { STOPPED_REASONS } from './liveRuns';
import type { AgentCursors } from './useAgentCursors';
import type { QueuedPrompt } from './agentLanes';
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

interface SteerMessages {
  payload: AcpPromptPayload;
  userMessage: AcpChatMessage;
  agentMessage: AcpChatMessage;
}

type PromptResult = Awaited<ReturnType<typeof platformBridge.sendAcpPrompt>>;

export type SendMode = 'now' | 'queue';

const failureReason = (err: unknown) => errorMessage(err).trim() || 'It stopped responding.';

const promptNote = ({ docs, caseRun, simTraining }: WorkspaceCore) =>
  joinNotes(
    marksNote(docs.projectRef.current.marks, docs.partsRef.current),
    runningCaseNote(caseRun.live ? simTraining.cases.active : null),
  );

export function useAgentRun({ core, lanes, actors, cursors, alive, placeCustomModel }: AgentRunOptions) {
  const { showToast } = core;
  const { setCustomModels } = core.studio;
  const { updateLane, setMessages, setQueue, flagsOf, keyOf } = lanes;

  const build = (params: AgentSendParams) => buildAgentPrompt({ ...params, note: promptNote(core) }, new Date());

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

      const res = await platformBridge.sendAcpPrompt({ ...payload, workspaceId: keyOf(id) });

      applyResult(id, res, modelCountBefore);

      return !STOPPED_REASONS.has(res.stopReason);
    } catch (err) {
      const reason = failureReason(err);

      setMessages(id, markLastAgentFailed(reason));
      showToast(`The agent couldn’t finish. ${reason}`, { tone: 'error' });

      return false;
    }
  };

  const takeNext = (id: string) => {
    const [next] = flagsOf(id).queued;

    if (next) setQueue(id, (queue) => queue.slice(1));

    return next;
  };

  const startQueued = (id: string, next: QueuedPrompt): AcpPromptPayload => {
    const { payload, userMessage, agentMessage } = build(next.params);
    const chatId = lanes.lanesRef.current.find((l) => l.id === id)?.chatId;

    setMessages(id, (prev) => [...prev, userMessage, agentMessage]);

    return chatId ? { ...payload, run: { chatId, messages: [userMessage, agentMessage] } } : payload;
  };

  const runAgentPrompt = async (id: string, first: AcpPromptPayload) => {
    let payload: AcpPromptPayload | undefined = first;

    const flags = flagsOf(id);

    flags.stopped = false;
    setBusy(id, true);
    updateLane(id, (l) => ({ ...l, edits: {} }));

    const gate = readinessGate(core);

    gate.begin();

    while (payload) {
      const finished = await runOnce(id, payload);
      const next = alive() && !flags.stopped ? takeNext(id) : undefined;
      const followUp = !next && finished && alive() && !flags.stopped ? await gate.followUp() : null;
      const queued = next ?? (followUp ? { id: newId('queued'), params: followUp } : undefined);

      payload = queued && startQueued(id, queued);
    }

    setBusy(id, false);
    void platformBridge.forgetAcpRun(keyOf(id));
    actors.endLane(id);
    cursors.clearLane(id);
  };

  const enqueue = (id: string, params: AgentSendParams, at: 'start' | 'end') => {
    const item = { id: newId('queued'), params };

    setQueue(id, (queue) => (at === 'start' ? [item, ...queue] : [...queue, item]));
  };

  const steer = async (id: string, params: AgentSendParams, sent: SteerMessages) => {
    const { payload, userMessage, agentMessage } = sent;
    const outcome = await platformBridge.steerAcp({ ...payload, workspaceId: keyOf(id) });

    if (outcome === 'injected') setMessages(id, (prev) => [...prev, userMessage, agentMessage]);
    else enqueue(id, params, 'start');
  };

  const send = async (params: AgentSendParams, mode: SendMode = 'now') => {
    const { id, chatId } = lanes.current;
    const chat = chatId ?? newId('chat');
    const built = build(params);
    const { userMessage, agentMessage } = built;
    const payload = { ...built.payload, run: { chatId: chat, messages: [userMessage, agentMessage] } };

    if (flagsOf(id).busy && mode === 'queue') {
      enqueue(id, params, 'end');

      return;
    }

    if (flagsOf(id).busy) {
      await steer(id, params, { payload, userMessage, agentMessage });

      return;
    }

    if (!chatId) updateLane(id, (l) => ({ ...l, chatId: chat }));

    setMessages(id, (prev) => [...prev, userMessage, agentMessage]);
    await runAgentPrompt(id, payload);
  };

  const retry = async (options: Omit<PromptOptions, 'note'>) => {
    const { id, messages, chatId } = lanes.current;
    const user = messages.findLast((m) => m.role === 'user');

    if (flagsOf(id).busy || !user) return;

    const fresh = emptyAgentMessage(new Date());
    const payload = resendPayload(user, { ...options, note: promptNote(core) });

    setMessages(id, (prev) => [...clearFailedReply(prev), fresh]);
    await runAgentPrompt(id, chatId ? { ...payload, run: { chatId, messages: [fresh] } } : payload);
  };

  const drain = async (id: string) => {
    const flags = flagsOf(id);

    if (flags.busy || flags.stopped) return;

    const next = takeNext(id);

    if (next) await runAgentPrompt(id, startQueued(id, next));
  };

  return { send, retry, drain };
}
