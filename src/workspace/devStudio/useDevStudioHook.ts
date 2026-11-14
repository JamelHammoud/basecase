import { useEffect, useRef } from 'react';
import { exposesTestHooks } from '../../utils/platform/testHooks';
import { useLatestRef } from '../../utils/useLatestRef';
import type { AgentSession } from '../useAgentSession';
import type { WorkspaceActions } from '../useWorkspaceActions';
import type { WorkspaceCore } from '../useWorkspaceCore';
import { assembleStudio } from './assembleStudio';
import { STUDIO_AREAS } from './studioAreas';
import type { StudioContext } from './types';

interface DevHookOptions {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
  routeFiles: (files: File[]) => void;
}

export function useDevStudioHook({ active, core, actions, agent, routeFiles }: DevHookOptions) {
  const { subscribePoses } = core.simTraining.sim;
  const posesRef = useRef<Float64Array | null>(null);
  const jointsRef = useRef<Float64Array | null>(null);
  const releaseTrainerRef = useRef<() => void>(() => {});
  const contextRef = useLatestRef<StudioContext>({
    core,
    actions,
    agent,
    routeFiles,
    posesRef,
    jointsRef,
    releaseTrainerRef,
  });

  useEffect(() => {
    if (!exposesTestHooks() || !active) return;

    return subscribePoses((poses, frame) => {
      posesRef.current = poses;
      jointsRef.current = frame.joints;
    });
  }, [active, subscribePoses]);

  useEffect(() => {
    if (!exposesTestHooks() || !active) return;

    (window as unknown as { __studio?: unknown }).__studio = assembleStudio(STUDIO_AREAS, () => contextRef.current);
  }, [active, contextRef]);

  useEffect(() => {
    if (!exposesTestHooks()) return;

    const registry = ((window as unknown as { __studios?: Record<string, unknown> }).__studios ??= {});

    registry[core.workspaceId] = assembleStudio(STUDIO_AREAS, () => contextRef.current);

    return () => {
      delete registry[core.workspaceId];
    };
  }, [core.workspaceId, contextRef]);
}
