import type { WorkspaceHandle, WorkspaceSeed } from '../SceneWorkspace';
import type { SavedSceneSummary } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { newSceneId } from '../utils/sceneIds';
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
  type Metas,
  type TabEntry,
} from './tabModel';
import type { TabsCore } from './useTabs';

interface RetireInput {
  closing: TabEntry[];
  list: TabEntry[];
  metas: Metas;
  handles: Map<string, WorkspaceHandle>;
  discard: boolean;
}

function retireTabs({ closing, list, metas, handles, discard }: RetireInput) {
  const remember: ClosedTab[] = [];
  let stoppedAgent = false;

  for (const tab of closing) {
    const handle = handles.get(tab.id);
    const meta = metas[tab.id];

    if (meta?.busy) {
      stoppedAgent = true;
      handle?.stopAgent();
    }

    handle?.persistChat();

    if (discard) handle?.discard();
    else void handle?.flush();

    const seed = handle ? handle.snapshot() : tab.seed;

    if (seed && !meta?.pristine && !discard) remember.push({ seed, index: list.indexOf(tab) });

    platformBridge.closeAcpWorkspace(tab.id);
  }

  return { remember, stoppedAgent };
}

export function useTabActions(core: TabsCore) {
  'use memo';

  const { latestRef, handles, setTabs, setActiveId, setMetas, setThumbs, setClosed } = core;
  const { selectTab, openTab, toastInFront, snapshotOf } = core;

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

    void loadSceneSeed(summary.id).then((seed) => {
      if (seed) openSeed(seed);
      else toastInFront(`Couldn’t open ${summary.name}`, { tone: 'error' });
    });
  };

  const undoClose = (remember: ClosedTab[], replacement: TabEntry | null) => {
    setClosed((prev) => prev.filter((c) => !remember.includes(c)));
    remember.forEach((c) => openTab(c.seed, c.index));

    if (!replacement || !latestRef.current.metas[replacement.id]?.pristine) return;

    setTabs((prev) => prev.filter((t) => t.id !== replacement.id));
    setMetas((prev) => omitKeys(prev, [replacement.id]));
    platformBridge.closeAcpWorkspace(replacement.id);
  };

  const closeTabs = (ids: string[], discard = false) => {
    const { tabs: list, metas, activeId } = latestRef.current;
    const closing = list.filter((t) => ids.includes(t.id));

    if (closing.length === 0) return;

    const { remember, stoppedAgent } = retireTabs({ closing, list, metas, handles: handles.current, discard });
    const kept = list.filter((t) => !ids.includes(t.id));
    const replacement = kept.length === 0 ? { id: newTabId(), seed: blankSeed(metas, ids) } : null;
    const remaining = replacement ? [replacement] : kept;

    setTabs(remaining);
    setActiveId(nextActiveAfterClose({ list, ids, activeId, remaining }));
    setMetas((prev) => omitKeys(prev, ids));
    setThumbs((prev) => omitKeys(prev, ids));

    if (remember.length === 0) return;

    setClosed((prev) => [...prev, ...remember].slice(-CLOSED_LIMIT));

    const action = { label: 'Undo', onClick: () => undoClose(remember, replacement) };

    window.setTimeout(() => toastInFront(closedMessage(remember, stoppedAgent), { tone: 'neutral', action }), 0);
  };

  const closeTab = (id: string) => closeTabs([id]);

  const reopenTab = () => {
    const { closed } = latestRef.current;
    const last = closed[closed.length - 1];

    if (!last) return;

    setClosed((prev) => prev.slice(0, -1));
    openTab(last.seed, last.index);
  };

  const duplicateTab = (id: string) => {
    const tab = latestRef.current.tabs.find((t) => t.id === id);
    const snap = tab && snapshotOf(tab);

    if (!snap) return;

    const at = latestRef.current.tabs.findIndex((t) => t.id === id) + 1;

    openTab(
      { ...snap, sceneId: newSceneId(), sceneName: `${snap.sceneName} Copy`, chat: undefined, unsaved: true },
      at,
    );
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
    openScene,
    closeTabs,
    closeTab,
    reopenTab,
    duplicateTab,
    cycleTab,
    reorderTab,
    renameTab,
    focusChat,
    notify,
  };
}
