import { useRef } from 'react';
import type { AgentOp } from '../agent/agentScene';
import { platformBridge } from '../utils/platformBridge';
import { applyAgentOps } from './applyAgentOps';
import { requestHandler, type RequestContext } from './agentRequestHandlers';
import { runPoseTool, runSimTool, withSavedPose } from './agentRobotTools';
import { runEngineeringNow } from './engineeringNow';
import type { AgentRequestEvent } from './types';
import type { AgentRun } from './useAgentRun';
import type { RobotInsert } from './useRobotInsert';
import type { WorkspaceCore } from './useWorkspaceCore';

type Payload = Record<string, unknown>;

interface AgentRequestOptions {
  core: WorkspaceCore;
  run: AgentRun;
  robots: RobotInsert;
}

export function useAgentRequests({ core, run, robots }: AgentRequestOptions) {
  const { docs, viewportRef, posing, simTraining, selectedIds } = core;
  const { partsRef, projectRef, setProjectNow, updateProjectNow, commitParts } = docs;
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const poseTool = (kind: string, payload: Payload) =>
    runPoseTool(kind, payload, {
      parts: partsRef.current,
      project: projectRef.current,
      viewport: viewportRef.current,
      setPose: posing.setPose,
      savePose: (name, state) => updateProjectNow((p) => withSavedPose(p, name, state)),
      addAnimation: posing.addAnimation,
      play: posing.play,
      selectedIds,
      setAction: run.setAction,
      importRobot: robots.importRobotFrom,
    });

  const simTool = (kind: string, payload: Payload) =>
    runSimTool(kind, payload, {
      sim: simTraining.sim,
      training: simTraining.training,
      rig: posing.rig,
      animations: projectRef.current.animations ?? [],
      policies: projectRef.current.policies ?? [],
      viewport: viewportRef.current,
      restoreCanvas: () => viewportRef.current?.setPose(posing.deltas),
      setAction: run.setAction,
    });

  const applyOps = (ops: AgentOp[]) => {
    const result = queueRef.current.then(() =>
      applyAgentOps(ops, {
        current: () => partsRef.current,
        commitParts,
        viewport: () => viewportRef.current,
        setCursor: run.setCursorTarget,
        setAction: run.setAction,
        isFollowing: run.isFollowing,
      }),
    );

    queueRef.current = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  };

  const handleAgentRequest = async (event: AgentRequestEvent) => {
    const respond = (result?: unknown, error?: string) =>
      platformBridge.respondToAgent({ requestId: event.requestId, result, error });
    const ctx: RequestContext = {
      parts: () => partsRef.current,
      project: () => projectRef.current,
      viewport: () => viewportRef.current,
      setProjectNow,
      setAction: run.setAction,
      setCursor: run.setCursorTarget,
      poseTool,
      simTool,
      verify: () =>
        runEngineeringNow({
          viewport: viewportRef.current,
          parts: partsRef.current,
          project: projectRef.current,
          withSweep: true,
        }),
      applyOps,
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
