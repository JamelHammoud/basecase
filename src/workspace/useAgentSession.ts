import type { CustomModelDefinition } from '../types/robotics';
import { analyzeImageFor3D } from '../utils/imageTo3DAnalyzer';
import { readImageFile } from '../utils/imageFile';
import { platformBridge } from '../utils/platformBridge';
import { applySessionUpdate, isTranscriptUpdate, type SessionUpdate } from './acpTranscript';
import type { AgentRequestEvent, WorkspaceSeed } from './types';
import { useAgentChat } from './useAgentChat';
import { useAgentRequests } from './useAgentRequests';
import { useAgentRun } from './useAgentRun';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';

type WorkspaceEvent = Record<string, unknown>;

const UPLOAD_SIDE = 1568;

interface AgentSessionOptions {
  core: WorkspaceCore;
  seed?: WorkspaceSeed;
  active: boolean;
  robots: RobotInsert;
  placeCustomModel: (model: CustomModelDefinition) => void;
}

export function useAgentSession({ core, seed, active, robots, placeCustomModel }: AgentSessionOptions) {
  const { workspaceId, studio, showToast } = core;
  const chat = useAgentChat({ workspaceId, seed, studio });
  const run = useAgentRun({ core, chat, active, placeCustomModel });
  const requests = useAgentRequests({ core, run, robots });
  const { setMessages, setAcpSessionId } = chat;
  const { setStatus } = run;
  const { handleAgentRequest } = requests;
  const { setUploadedImages } = studio;

  const onSessionUpdate = (update: SessionUpdate) => {
    if (!isTranscriptUpdate(update)) return;

    const now = new Date();

    setMessages((prev) => applySessionUpdate(prev, update, now));
  };

  const eventHandlers: Record<string, (event: WorkspaceEvent) => void> = {
    'agent-request': (event) => {
      if (typeof event.requestId === 'string') void handleAgentRequest(event as unknown as AgentRequestEvent);
    },
    'agent-status': (event) => setStatus(String(event.status || '')),
    'agent-blocked': (event) =>
      showToast(`Blocked “${String(event.title)}”: the agent only edits the model`, { tone: 'neutral' }),
    'acp-session': (event) => {
      if (typeof event.sessionId === 'string') setAcpSessionId(event.sessionId);
    },
    'acp-session-update': (event) => {
      if (event.update) onSessionUpdate(event.update as SessionUpdate);
    },
  };

  const uploadImage = async (file: File) => {
    const { dataUrl, width, height } = await readImageFile(file, UPLOAD_SIDE);
    const features = await analyzeImageFor3D(dataUrl, 70, 12);
    const record = await platformBridge.uploadImage({ name: file.name, dataUrl, width, height });

    setUploadedImages(await platformBridge.listImages());

    return { record, features };
  };

  const onEvent = (event: WorkspaceEvent) => {
    const type = String(event.type);

    if (Object.hasOwn(eventHandlers, type)) eventHandlers[type](event);
  };

  return {
    chat,
    run,
    requests,
    onEvent,
    uploadImage,
    acpStatus: { ...studio.acpStatus, sessionId: chat.acpSessionId },
    activity: run.isBusy ? run.action || run.status || 'Working' : '',
  };
}

export type AgentSession = ReturnType<typeof useAgentSession>;
