import { leadAgentName } from '../agent/agentKinds';
import { useEffect, useRef, useState } from 'react';
import type { CustomModelDefinition } from '../types/robotics';
import { analyzeImageFor3D } from '../utils/imageTo3DAnalyzer';
import { readImageFile } from '../utils/imageFile';
import { platformBridge } from '../utils/platformBridge';
import { applySessionUpdate, isTranscriptUpdate, type SessionUpdate } from './acpTranscript';
import { ActorIndex } from './agentActors';
import { MAIN_LANE, splitLaneKey } from './agentLanes';
import type { AgentRequestEvent, WorkspaceSeed } from './types';
import { lanePersister, useAgentChat } from './useAgentChat';
import { useAgentCursors } from './useAgentCursors';
import { useAgentLanes } from './useAgentLanes';
import { useAgentRequests } from './useAgentRequests';
import { useAgentRun } from './useAgentRun';
import { useLaneControls } from './useLaneControls';
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

function useAlive() {
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;
    };
  }, []);

  return () => aliveRef.current;
}

const laneOfEvent = (event: WorkspaceEvent) =>
  typeof event.workspaceId === 'string' ? splitLaneKey(event.workspaceId).laneId : MAIN_LANE;

export function useAgentSession({ core, seed, active, robots, placeCustomModel }: AgentSessionOptions) {
  const { workspaceId, studio, showToast } = core;
  const [actors] = useState(() => new ActorIndex());
  const alive = useAlive();
  const lanes = useAgentLanes(workspaceId, seed);
  const cursors = useAgentCursors();
  const run = useAgentRun({ core, lanes, actors, cursors, alive, placeCustomModel });
  const persistLane = lanePersister(lanes, studio.setChatList);
  const controls = useLaneControls({ core, lanes, active, alive, persistLane });
  const chat = useAgentChat({ core, lanes, stop: controls.stop, persistLane });
  const requests = useAgentRequests({ core, lanes, controls, actors, cursors, robots });
  const { handleAgentRequest } = requests;
  const { setUploadedImages } = studio;
  const { current } = lanes;

  const onSessionUpdate = (laneId: string, update: SessionUpdate) => {
    const finished = actors.note(laneId, update);

    if (finished) cursors.clearActor(finished);

    if (!isTranscriptUpdate(update)) return;

    const now = new Date();

    lanes.setMessages(laneId, (prev) => applySessionUpdate(prev, update, now));
  };

  const onStatus = (laneId: string, event: WorkspaceEvent) => {
    const status = String(event.status || '');
    const actor = actors.actorOf(laneId, typeof event.toolUseId === 'string' ? event.toolUseId : undefined);

    if (actor === laneId) lanes.updateLane(laneId, (l) => ({ ...l, status }));
    else cursors.setAction(actor, actors.nameOf(actor, leadAgentName(studio.acpStatus)), status);
  };

  const eventHandlers: Record<string, (event: WorkspaceEvent, laneId: string) => void> = {
    'agent-request': (event) => {
      if (typeof event.requestId === 'string') void handleAgentRequest(event as unknown as AgentRequestEvent);
    },
    'agent-status': (event, laneId) => onStatus(laneId, event),
    'agent-blocked': (event) =>
      showToast(`Blocked “${String(event.title)}”: the agent only edits the model`, { tone: 'neutral' }),
    'acp-session': (event, laneId) => {
      const sessionId = event.sessionId;

      if (typeof sessionId === 'string') lanes.updateLane(laneId, (l) => ({ ...l, acpSessionId: sessionId }));
    },
    'acp-session-update': (event, laneId) => {
      if (event.update) onSessionUpdate(laneId, event.update as SessionUpdate);
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

    if (Object.hasOwn(eventHandlers, type)) eventHandlers[type](event, laneOfEvent(event));
  };

  const working = lanes.lanes.find((l) => l.busy);
  const lead = working && cursors.cursors.find((c) => c.actor === working.id);

  return {
    lanes,
    current,
    chat,
    controls,
    cursors: cursors.cursors,
    requests,
    send: run.send,
    onEvent,
    uploadImage,
    busy: !!working,
    acpStatus: { ...studio.acpStatus, sessionId: current.acpSessionId },
    activity: working ? lead?.action || working.status || 'Working' : '',
  };
}

export type AgentSession = ReturnType<typeof useAgentSession>;
