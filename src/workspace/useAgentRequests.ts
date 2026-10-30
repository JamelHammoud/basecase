import { resolvePrinter } from '../data/printers';
import { useRef } from 'react';
import type { AgentOp } from '../agent/agentScene';
import { platformBridge } from '../utils/platformBridge';
import { conflictText, type ActorIndex } from './agentActors';
import { MAIN_LANE, splitLaneKey } from './agentLanes';
import { applyAgentOps } from './applyAgentOps';
import { requestHandler, type RequestContext } from './agentRequestHandlers';
import { runPoseTool, runSimTool, withSavedPose } from './agentRobotTools';
import { sceneChecks } from './sceneChecks';
import type { AgentRequestEvent, Vec3 } from './types';
import type { AgentCursors } from './useAgentCursors';
import type { AgentLanes } from './useAgentLanes';
import type { LaneControls } from './useLaneControls';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';

type Payload = Record<string, unknown>;

type SetAction = (action: string) => void;

interface AgentRequestOptions {
  core: WorkspaceCore;
  lanes: AgentLanes;
  controls: LaneControls;
  actors: ActorIndex;
  cursors: AgentCursors;
  robots: RobotInsert;
}

interface Author {
  laneId: string;
  actor: string;
  setAction: SetAction;
  setCursor: (target: Vec3) => void;
  claim: (partId: string) => void;
}

const quiet: SetAction = () => {};

const KEEP_REQUEST_IDS = 2000;
const deliveredRequests = new Set<string>();

function firstDelivery(requestId: string) {
  if (deliveredRequests.has(requestId)) return false;

  deliveredRequests.add(requestId);

  if (deliveredRequests.size > KEEP_REQUEST_IDS) deliveredRequests.delete(deliveredRequests.values().next().value!);

  return true;
}

export function useAgentRequests({ core, lanes, controls, actors, cursors, robots }: AgentRequestOptions) {
  const { docs, viewportRef, posing, simTraining, selectedIds } = core;
  const { partsRef, projectRef, setProjectNow, updateProjectNow, commitParts } = docs;
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const poseTool = (kind: string, payload: Payload, setAction: SetAction = quiet) =>
    runPoseTool(kind, payload, {
      parts: partsRef.current,
      project: projectRef.current,
      viewport: viewportRef.current,
      setPose: posing.setPose,
      savePose: (name, state) => updateProjectNow((p) => withSavedPose(p, name, state)),
      addAnimation: posing.addAnimation,
      play: posing.play,
      selectedIds,
      setAction,
      importRobot: robots.importRobotFrom,
    });

  const simTool = (kind: string, payload: Payload, setAction: SetAction = quiet) =>
    runSimTool(kind, payload, {
      sim: simTraining.sim,
      training: simTraining.training,
      rig: posing.rig,
      animations: projectRef.current.animations ?? [],
      policies: projectRef.current.policies ?? [],
      viewport: viewportRef.current,
      restoreCanvas: () => viewportRef.current?.setPose(posing.deltas),
      setAction,
    });

  const laneBusy = (id: string) => lanes.isBusy(id);

  const guard = (author: Author, partId: string) => {
    const holder = actors.holderOf(partId, author.actor, laneBusy);

    if (holder) return conflictText(partId, holder, actors);

    actors.claim(partId, author.actor);
    author.claim(partId);

    return null;
  };

  const applyOps = (ops: AgentOp[], author: Author) => {
    const result = queueRef.current.then(() =>
      applyAgentOps(ops, {
        current: () => partsRef.current,
        commitParts,
        viewport: () => viewportRef.current,
        setCursor: author.setCursor,
        setAction: author.setAction,
        isFollowing: () => controls.isFollowing(author.laneId),
        guard: (partId) => guard(author, partId),
        touch: (partId) =>
          controls.recordEdit(author.laneId, partId, partsRef.current.find((p) => p.id === partId) ?? null),
      }),
    );

    queueRef.current = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  };

  const authorOf = (event: AgentRequestEvent): Author => {
    const laneId = event.workspaceId ? splitLaneKey(event.workspaceId).laneId : MAIN_LANE;
    const actor = actors.actorOf(laneId, event.toolUseId);
    const name = actors.nameOf(actor);

    return {
      laneId,
      actor,
      setAction: (action) => cursors.setAction(actor, name, action),
      setCursor: (target) => cursors.setCursor(actor, name, target),
      claim: (partId) => cursors.claim(actor, name, partId),
    };
  };

  const handleAgentRequest = async (event: AgentRequestEvent) => {
    if (!firstDelivery(event.requestId)) return;

    const respond = (result?: unknown, error?: string) =>
      platformBridge.respondToAgent({ requestId: event.requestId, result, error });
    const author = authorOf(event);
    const ctx: RequestContext = {
      parts: () => partsRef.current,
      project: () => projectRef.current,
      printer: () => resolvePrinter(projectRef.current.printer, core.studio.printers.printers),
      slice: (report) => core.printing.job.sliceReport(report),
      viewport: () => viewportRef.current,
      setProjectNow,
      setAction: author.setAction,
      setCursor: author.setCursor,
      poseTool: (kind, payload) => poseTool(kind, payload, author.setAction),
      simTool: (kind, payload) => simTool(kind, payload, author.setAction),
      ...sceneChecks(core, author.setAction),
      applyOps: (ops) => applyOps(ops, author),
      edits: (owner) => actors.editsFor(author.actor, owner),
      buildGuide: core.guide.generate,
    };

    try {
      const handler = requestHandler(event.kind);

      if (!handler) {
        await respond(undefined, `Unknown request "${event.kind}"`);

        return;
      }

      await respond(await handler(event.payload, ctx, event.kind));
    } catch (err) {
      await respond(undefined, String((err as Error).message ?? err));
    }
  };

  return { handleAgentRequest, poseTool, simTool };
}
