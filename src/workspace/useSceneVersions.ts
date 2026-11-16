import { restoreWorldAssets } from '../cases/worldAssets';
import { useRef, useState } from 'react';
import { openVersionBranch } from '../app/sceneBranches';
import { useVersionRunActions } from './useVersionRunActions';
import { useVersionActivity } from './useVersionActivity';
import { platformBridge } from '../utils/platformBridge';
import { sceneJson } from '../utils/sceneJson';
import { sceneStore } from '../utils/sceneStore';
import { queueSceneWrite } from '../utils/sceneWrites';
import { useLatestRef } from '../utils/useLatestRef';
import { rememberHistory, versionRequest } from './versionClient';
import type { VersionRequest, VersionView } from './versionOperations';
import type { VersionScene } from './sceneVersions';
import type { SceneDocument } from './useSceneDocument';
import type { StudioShared, WorkspaceSeed } from './types';

export interface VersionOptions {
  seed?: WorkspaceSeed;
  docs: SceneDocument;
  scene: { sceneId: string; sceneName: string; globalGoal: string; setGlobalGoal: (goal: string) => void };
  annotations: { annotations: VersionScene['annotations']; reset: (annotations: VersionScene['annotations']) => void };
  studio: StudioShared;
}

export function useSceneVersions(options: VersionOptions) {
  const latest = useLatestRef(options);
  const [history, setHistory] = useState(options.seed?.history);
  const historyRef = useRef(history);
  const chatIdRef = useRef<string | undefined>(options.seed?.chat?.chatId ?? undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [view, setView] = useState<VersionView | null>(null);
  const [open, setOpen] = useState(false);
  const { busy, problem, perform } = useVersionActivity();

  const snapshot = (): VersionScene => {
    const { docs, scene, annotations } = latest.current;

    return {
      parts: docs.partsRef.current,
      project: docs.projectRef.current,
      annotations: annotations.annotations,
      globalGoal: scene.globalGoal,
    };
  };

  const publish = (next: VersionView) => {
    rememberHistory(next.history, next.quoted);
    historyRef.current = next.history;
    setHistory(next.history);
    setView(next);
  };

  const persist = async (next: VersionView, design: VersionScene) => {
    const { scene } = latest.current;
    const json = await sceneJson({
      ...design,
      id: scene.sceneId,
      name: scene.sceneName,
      chatId: chatIdRef.current,
      history: next.history,
      autosave: true,
    });

    sceneStore.upsert(await queueSceneWrite(scene.sceneId, () => platformBridge.saveSceneJson(json)));
  };

  const request = (details: Omit<VersionRequest, 'history' | 'scene'>) => {
    const design = snapshot();
    const sceneId = latest.current.scene.sceneId;
    const run = async () => {
      const next = await versionRequest({ ...details, history: historyRef.current, scene: await sceneJson(design) });

      if (latest.current.scene.sceneId !== sceneId) throw new Error('Open the original scene to change its history.');

      publish(next);

      if (details.action !== 'view') await persist(next, next.scene ?? design);

      return { ...next, captured: design };
    };
    const pending = chain.current.then(run);

    chain.current = pending.catch(() => {});

    return pending;
  };

  const apply = async (design: VersionScene) => {
    await restoreWorldAssets(design.worldAssets);

    const { docs, scene, annotations } = latest.current;

    docs.commitVersion(design.parts, design.project, {
      globalGoal: scene.globalGoal,
      annotations: annotations.annotations,
    });
    scene.setGlobalGoal(design.globalGoal);
    annotations.reset(design.annotations);
  };

  const restore = async (id: string) => {
    const next = await request({ action: 'restore', id });

    if (!next.scene) return;

    await apply(next.scene);
  };

  const branch = async (id?: string): Promise<WorkspaceSeed> => {
    const saved = id ? await request({ action: 'view' }) : await request({ action: 'capture', label: 'Branch point' });
    const { scene, studio } = latest.current;

    return openVersionBranch({
      history: saved.history,
      id: id ?? saved.head!,
      sceneId: scene.sceneId,
      sceneName: scene.sceneName,
      names: studio.tabs.map((tab) => tab.name),
    });
  };

  return {
    history,
    historyRef,
    view,
    open,
    busy,
    problem,
    snapshot,
    apply,
    persist,
    publish,
    request,
    perform,
    branch,
    reset: (value?: string) => {
      historyRef.current = value;
      setHistory(value);
      setView(null);
    },
    show: () => {
      setOpen(true);
      void perform(() => request({ action: 'view' }));
    },
    close: () => setOpen(false),
    capture: (label: string) => request({ action: 'capture', label }),
    restore,
    revert: async (run: string, selected: string[]) => {
      const next = await request({ action: 'revert', run, selected });

      if (next.scene) await apply(next.scene);
    },
    ...useVersionRunActions({ historyRef, chatIdRef, request }),
    flush: () => chain.current,
  };
}

export type SceneVersions = ReturnType<typeof useSceneVersions>;
