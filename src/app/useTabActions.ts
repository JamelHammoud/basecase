import { branchScene } from './sceneBranches';
import { closedSeed, retireTabs } from './tabRetirement';
import { errorMessage } from '../utils/errorMessage';
import { useState } from 'react';
import type { WorkspaceSeed } from '../SceneWorkspace';
import type { SavedSceneSummary } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import { loadSceneSeed } from './sceneSeeds';
import {
  blankSeed,
  CLOSED_LIMIT,
  closedMessage,
  findSceneTab,
  moveTab,
  newTabId,
  nextActiveAfterClose,
  omitKeys,
  type ClosedTab,
  type TabEntry,
} from './tabModel';
import type { TabsCore } from './useTabs';

async function duplicateSceneTab(core: TabsCore, id: string) {
  const { latestRef, handles, snapshotOf, openTab } = core;
  const tab = latestRef.current.tabs.find((t) => t.id === id);
  const snap = tab && snapshotOf(tab);

  if (!snap) return;

  const branched = await handles.current.get(id)?.branch?.();

  if (branched) {
    openTab(branched);

    return;
  }

  const { tabs, metas } = latestRef.current;
  const names = [...Object.values(metas).map((meta) => meta.name), ...sceneStore.get().map((entry) => entry.name)];
  const seed = await branchScene(snap, names);

  openTab(seed, tabs.findIndex((tab) => tab.id === id) + 1);
}

export function useTabActions(core: TabsCore) {
  'use memo';

  const { latestRef, handles, setTabs, setActiveId, setMetas, setThumbs, setClosed } = core;
  const { selectTab, openTab, toastInFront } = core;
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const reportError = (error: unknown) => toastInFront(errorMessage(error), { tone: 'error' });

  const openSeed = (seed: WorkspaceSeed) => {
    const { tabs, metas, activeId } = latestRef.current;
    const open = findSceneTab(tabs, metas, seed.sceneId);

    if (open) {
      selectTab(open.id);

      return;
    }

    if (metas[activeId]?.pristine) {
      handles.current.get(activeId)?.load(seed);

      return;
    }

    openTab(seed);
  };

  const openScene = (summary: SavedSceneSummary) => {
    const { tabs, metas } = latestRef.current;
    const open = findSceneTab(tabs, metas, summary.id);

    if (open) {
      selectTab(open.id);

      return;
    }

    const closed = latestRef.current.closed.findLast((tab) => tab.seed.sceneId === summary.id);

    void Promise.resolve(closed?.ready)
      .then(() => loadSceneSeed(summary.id))
      .then((seed) => {
        if (seed) openSeed(seed);
        else toastInFront(`Couldn’t open ${summary.name}`, { tone: 'error' });
      })
      .catch(reportError);
  };

  const undoClose = async (remember: ClosedTab[], replacement: TabEntry | null) => {
    setClosed((prev) => prev.filter((c) => !remember.includes(c)));

    const seeds = await Promise.all(remember.map(closedSeed));

    remember.forEach((c, index) => openTab(seeds[index], c.index));

    if (!replacement || !latestRef.current.metas[replacement.id]?.pristine) return;

    setTabs((prev) => prev.filter((t) => t.id !== replacement.id));
    setMetas((prev) => omitKeys(prev, [replacement.id]));
    platformBridge.closeAcpWorkspace(replacement.id);
  };

  const closeTabs = (ids: string[], discard = false) => {
    const { tabs: list, metas, activeId } = latestRef.current;
    const closing = list.filter((t) => ids.includes(t.id));

    if (closing.length === 0) return;

    const { remember, stoppedAgent } = retireTabs({
      closing,
      list,
      metas,
      handles: handles.current,
      discard,
      onError: reportError,
    });
    const kept = list.filter((t) => !ids.includes(t.id));
    const replacement = kept.length === 0 ? { id: newTabId(), seed: blankSeed(metas, ids) } : null;
    const remaining = replacement ? [replacement] : kept;

    setTabs(remaining);
    setActiveId(nextActiveAfterClose({ list, ids, activeId, remaining }));
    setMetas((prev) => omitKeys(prev, ids));
    setThumbs((prev) => omitKeys(prev, ids));

    if (remember.length === 0) return;

    setClosed((prev) => [...prev, ...remember].slice(-CLOSED_LIMIT));

    const action = { label: 'Undo', onClick: () => void undoClose(remember, replacement).catch(reportError) };

    window.setTimeout(() => toastInFront(closedMessage(remember, stoppedAgent), { tone: 'neutral', action }), 0);
  };

  const closeTab = (id: string) => closeTabs([id]);

  const reopenTab = async () => {
    const { closed } = latestRef.current;
    const last = closed[closed.length - 1];

    if (!last) return;

    setClosed((prev) => prev.slice(0, -1));
    openTab(await closedSeed(last), last.index);
  };

  const cycleTab = (step: number) => {
    const { tabs: list, activeId } = latestRef.current;

    if (list.length < 2) return;

    const i = list.findIndex((t) => t.id === activeId);

    selectTab(list[(i + step + list.length) % list.length].id);
  };

  const reorderTab = (from: number, to: number) => setTabs((prev) => moveTab(prev, from, to));

  const renameTab = (id: string, name: string) => handles.current.get(id)?.rename(name);

  const focusChat = (chatId: string, from: string) => {
    const { tabs, metas } = latestRef.current;
    const owner = tabs.find((t) => t.id !== from && metas[t.id]?.chatIds.includes(chatId));

    if (!owner) return false;

    selectTab(owner.id);

    return true;
  };

  const notify = (from: string, message: string) => {
    if (from === latestRef.current.activeId) return;

    toastInFront(message, { tone: 'success', action: { label: 'Show', onClick: () => selectTab(from) } });
  };

  return {
    showHistory: (id: string) => {
      selectTab(id);
      handles.current.get(id)?.showHistory?.();
    },
    openScene,
    closeTabs,
    closeTab,
    reopenTab: () => void reopenTab().catch(reportError),
    duplicateTab: (id: string) => void duplicateSceneTab(core, id).catch(reportError),
    cycleTab,
    reorderTab,
    renameTab,
    renamingTab,
    setRenamingTab,
    focusChat,
    notify,
  };
}
