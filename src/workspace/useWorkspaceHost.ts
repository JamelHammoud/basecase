import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { downscaleDataUrl } from '../utils/imageFile';
import { useLatestRef } from '../utils/useLatestRef';
import type { WorkspaceHandle, WorkspaceMeta, WorkspaceSeed } from './types';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceCore } from './useWorkspaceCore';

interface HostOptions {
  active: boolean;
  seed?: WorkspaceSeed;
  core: WorkspaceCore;
  agent: AgentSession;
}

const THUMBNAIL_SIDE = 560;

function useRegisterHandle({ core, agent }: Pick<HostOptions, 'core' | 'agent'>) {
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
    load: loadSeed,
    persist: agent.chat.persist,
    stop: agent.run.stop,
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
      stopAgent: () => hostRef.current.stop(),
    };

    register(workspaceId, handle);

    return () => register(workspaceId, null);
  }, [workspaceId, hostRef, viewportRef, setSceneName]);
}

function useReportMeta({ seed, core, agent }: Pick<HostOptions, 'seed' | 'core' | 'agent'>) {
  const { workspaceId, studio, scene, parts, annotations } = core;
  const { sceneId, sceneName, globalGoal, initial } = scene;
  const { chatId, messages } = agent.chat;
  const busy = agent.run.isBusy;
  const { activity } = agent;
  const partCount = parts.length;
  const pristine =
    (!seed || !!seed.blank) &&
    sceneId === initial.sceneId &&
    sceneName === initial.sceneName &&
    partCount === 0 &&
    annotations.annotations.length === 0 &&
    messages.length === 0 &&
    !globalGoal;
  const report = useEffectEvent((id: string, meta: WorkspaceMeta) => studio.reportMeta(id, meta));

  useEffect(() => {
    report(workspaceId, { sceneId, name: sceneName, partCount, busy, activity, chatId, pristine });
  }, [workspaceId, sceneId, sceneName, partCount, busy, activity, chatId, pristine]);
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
  useRegisterHandle({ core, agent });
  useReportMeta({ seed, core, agent });

  return useRightIslandWidth(active, core);
}
