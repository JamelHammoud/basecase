import { restoreWorldAssets } from '../cases/worldAssets';
import { useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
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
import { snapshotMatches } from './versionMerge';

export interface VersionOptions {
  seed?: WorkspaceSeed;
  docs: SceneDocument;
  scene: { sceneId: string; sceneName: string; globalGoal: string; setGlobalGoal: (goal: string) => void };
  annotations: { annotations: VersionScene['annotations']; reset: (annotations: VersionScene['annotations']) => void };
  studio: StudioShared;
}

function sessionGuard(latest: RefObject<VersionOptions>, generation: RefObject<number>) {
  const sceneId = latest.current.scene.sceneId;
  const started = generation.current;

  return () => {
    if (latest.current.scene.sceneId !== sceneId || generation.current !== started)
      throw new Error('Open the original scene to change its history.');
  };
}

async function persistVersion(
  next: VersionView,
  snapshot: () => VersionScene,
  metadata: { sceneId: string; sceneName: string; chatId?: string },
  assertCurrent: () => void,
) {
  await queueSceneWrite(metadata.sceneId, async () => {
    assertCurrent();

    const json = await sceneJson({
      ...snapshot(),
      id: metadata.sceneId,
      name: metadata.sceneName,
      chatId: metadata.chatId,
      history: next.history,
      autosave: true,
    });

    assertCurrent();

    const saved = await platformBridge.saveSceneJson(json);

    if (!saved) throw new Error('Open the original scene to change its history.');

    sceneStore.upsert(saved);
  });
}

export function useSceneVersions(options: VersionOptions) {
  const latest = useLatestRef(options);
  const [history, setHistory] = useState(options.seed?.history);
  const historyRef = useRef(history);
  const chatIdRef = useRef<string | undefined>(options.seed?.chat?.chatId ?? undefined);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const [view, setView] = useState<VersionView | null>(null);
  const [open, setOpen] = useState(false);
  const { busy, problem, perform } = useVersionActivity();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = chain.current.then(operation);

    chain.current = pending.catch(() => {});

    return pending;
  };

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

  const persist = (next: VersionView) =>
    persistVersion(
      next,
      snapshot,
      { ...latest.current.scene, chatId: chatIdRef.current },
      sessionGuard(latest, generation),
    );

  const request = (details: Omit<VersionRequest, 'history' | 'scene'>) => {
    const assertCurrent = sessionGuard(latest, generation);
    const run = async () => {
      assertCurrent();

      const design = snapshot();
      const next = await versionRequest({ ...details, history: historyRef.current, scene: await sceneJson(design) });

      assertCurrent();
      rememberHistory(next.history, next.quoted);

      if (next.scene) await apply(next.scene, design);

      if (details.action !== 'view') await persist(next);

      assertCurrent();

      publish(next);

      return { ...next, captured: design };
    };

    return serialize(run);
  };

  const apply = async (design: VersionScene, expected = snapshot()) => {
    const sceneId = latest.current.scene.sceneId;
    const started = generation.current;

    await restoreWorldAssets(design.worldAssets);

    const { docs, scene, annotations } = latest.current;

    if (scene.sceneId !== sceneId || generation.current !== started || !snapshotMatches(snapshot(), expected))
      throw new Error('The design changed. Compare again.');

    flushSync(() => {
      docs.commitVersion(design.parts, design.project, {
        globalGoal: scene.globalGoal,
        annotations: annotations.annotations,
      });
      scene.setGlobalGoal(design.globalGoal);
      annotations.reset(design.annotations);
    });
  };

  const restore = async (id: string) => {
    await request({ action: 'restore', id });
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
    serialize,
    request,
    perform,
    branch,
    reset: (value?: string) => {
      generation.current += 1;
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
    revert: (run: string, selected: string[]) => request({ action: 'revert', run, selected }),
    ...useVersionRunActions({ historyRef, chatIdRef, request }),
    flush: () => chain.current,
  };
}

export type SceneVersions = ReturnType<typeof useSceneVersions>;
