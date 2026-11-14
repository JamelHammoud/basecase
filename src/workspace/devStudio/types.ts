import type { RefObject } from 'react';
import type { AgentSession } from '../useAgentSession';
import type { WorkspaceActions } from '../useWorkspaceActions';
import type { WorkspaceCore } from '../useWorkspaceCore';

export interface StudioContext {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
  routeFiles: (files: File[]) => void;
  posesRef: RefObject<Float64Array | null>;
  jointsRef: RefObject<Float64Array | null>;
  releaseTrainerRef: RefObject<() => void>;
}

export type Studio = () => StudioContext;

export type StudioHooks = Record<string, unknown>;

export type StudioArea = (studio: Studio) => StudioHooks;
