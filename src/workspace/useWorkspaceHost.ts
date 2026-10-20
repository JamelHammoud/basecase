import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { downscaleDataUrl } from '../utils/imageFile';
import { useLatestRef } from '../utils/useLatestRef';
import type { SceneDraft } from './sceneDraft';
import type { WorkspaceHandle, WorkspaceMeta, WorkspaceSeed } from './types';
import type { AgentSession } from './useAgentSession';
import { useAutosave, type Autosave } from './useAutosave';
import type { WorkspaceCore } from './useWorkspaceCore';

interface HostOptions {
  active: boolean;
  seed?: WorkspaceSeed;
  core: WorkspaceCore;
  agent: AgentSession;
}

const THUMBNAIL_SIDE = 560;

interface HandleOptions {
  core: WorkspaceCore;
  agent: AgentSession;
  autosave: Autosave;
}

function useRegisterHandle({ core, agent, autosave }: HandleOptions) {
  const { workspaceId, studio, scene, docs, annotations, viewportRef, showToast, loadSeed } = core;
  const { setSceneName } = scene;
  const hostRef = useLatestRef({
    event: agent.onEvent,
    snapshot: (): WorkspaceSeed => ({
      sceneId: scene.sceneId,
      sceneName: scene.sceneName,
      globalGoal: scene.globalGoal,
      parts: docs.partsRef.current,
      annotations: annotations.annotations,
      project: docs.projectRef.current,
      chat: agent.chat.chatSnapshot(),
    }),
    load: (next: WorkspaceSeed, toast?: string) => {
      loadSeed(next, toast);
      agent.chat.restore(next.chat);
    },
    persist: agent.chat.persistAll,
    flush: autosave.flush,
    discard: autosave.discard,
    stop: agent.controls.stopAll,
    toast: showToast,
  });
  const register = useEffectEvent((id: string, handle: WorkspaceHandle | null) => studio.register(id, handle));

  useEffect(() => {
    const handle: WorkspaceHandle = {
      onEvent: (e) => hostRef.current.event(e),
      snapshot: () => hostRef.current.snapshot(),
      thumbnail: async () => {
        const shot = viewportRef.current?.captureScreenshot();

        return shot ? downscaleDataUrl(shot, THUMBNAIL_SIDE, 0.86) : '';
      },
      load: (next, toast) => hostRef.current.load(next, toast),
      rename: (name) => setSceneName(name),
      toast: (message, opts) => hostRef.current.toast(message, opts),
      persistChat: () => hostRef.current.persist(),
      flush: () => hostRef.current.flush(),
      discard: () => hostRef.current.discard(),
      stopAgent: () => hostRef.current.stop(),
    };

    register(workspaceId, handle);

    return () => register(workspaceId, null);
  }, [workspaceId, hostRef, viewportRef, setSceneName]);
}

function isPristine({ seed, core, agent }: Pick<HostOptions, 'seed' | 'core' | 'agent'>) {
  const { sceneId, sceneName, globalGoal, initial } = core.scene;

  return (
    (!seed || !!seed.blank) &&
    sceneId === initial.sceneId &&
    sceneName === initial.sceneName &&
    core.parts.length === 0 &&
    core.annotations.annotations.length === 0 &&
    agent.lanes.lanes.every((l) => l.messages.length === 0) &&
    !globalGoal
  );
}

function useReportMeta({ core, agent, pristine }: Pick<HostOptions, 'core' | 'agent'> & { pristine: boolean }) {
  const { workspaceId, studio, scene, parts } = core;
  const { sceneId, sceneName } = scene;
  const { chatId } = agent.current;
  const chatKey = agent.chat.chatIds.join(' ');
  const { busy, activity } = agent;
  const partCount = parts.length;
  const report = useEffectEvent((id: string, meta: WorkspaceMeta) => studio.reportMeta(id, meta));

  useEffect(() => {
    const chatIds = chatKey ? chatKey.split(' ') : [];

    report(workspaceId, { sceneId, name: sceneName, partCount, busy, activity, chatId, chatIds, pristine });
  }, [workspaceId, sceneId, sceneName, partCount, busy, activity, chatId, chatKey, pristine]);
}

function useRightIslandWidth(active: boolean, core: WorkspaceCore) {
  const rightIslandRef = useRef<HTMLDivElement | null>(null);
  const { isRightOpen } = core.studio;
  const reportWidth = useEffectEvent((width: number) => core.studio.reportRightIsland(width));

  useLayoutEffect(() => {
    const el = rightIslandRef.current;

    if (!active || !el) return;

    const report = () => reportWidth(el.offsetWidth);

    report();

    const ro = new ResizeObserver(report);

    ro.observe(el);

    return () => ro.disconnect();
  }, [active, isRightOpen]);

  return rightIslandRef;
}

export function useWorkspaceHost({ active, seed, core, agent }: HostOptions) {
  const pristine = isPristine({ seed, core, agent });
  const { sceneId, sceneName, globalGoal } = core.scene;
  const draft: SceneDraft = {
    sceneId,
    sceneName,
    globalGoal,
    parts: core.parts,
    annotations: core.annotations.annotations,
    project: core.project,
    chatId: agent.current.chatId,
  };
  const autosave = useAutosave({ draft, active, pristine, unsaved: !!seed?.unsaved });

  useRegisterHandle({ core, agent, autosave });
  useReportMeta({ core, agent, pristine });

  return useRightIslandWidth(active, core);
}
