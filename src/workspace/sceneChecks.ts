import { sweepRequest } from './agentSweepRequest';
import type { RequestContext } from './agentRequestHandlers';
import type { WorkspaceCore } from './useWorkspaceCore';
import { verifyDesign } from './verifyDesign';

export function sceneChecks(
  core: WorkspaceCore,
  setAction: (action: string) => void,
): Pick<RequestContext, 'verify' | 'sweep'> {
  const { docs, viewportRef, posing, simTraining } = core;

  return {
    verify: (opts) =>
      verifyDesign({
        viewport: viewportRef.current,
        parts: docs.partsRef.current,
        project: docs.projectRef.current,
        setAction,
        peak: opts?.peak
          ? {
              sim: simTraining.sim,
              training: simTraining.training,
              policies: docs.projectRef.current.policies ?? [],
            }
          : undefined,
      }),
    sweep: (payload) =>
      sweepRequest(
        {
          sim: simTraining.sim,
          parts: docs.partsRef.current,
          project: docs.projectRef.current,
          pose: posing.pose,
          viewport: viewportRef.current,
        },
        payload,
      ),
  };
}
