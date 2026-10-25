import { useEffect, useState } from 'react';
import type { WorkspaceHandle, WorkspaceSeed } from '../SceneWorkspace';
import { loadSceneSeed } from './sceneSeeds';
import { readStored, writeStored } from './storedSettings';
import { blankSeed, FIRST_TAB, MAX_TABS, newTabId, type TabEntry, type TabListItem } from './tabModel';

const KEY = 'open-scenes';

interface StoredOpenScenes {
  ids: string[];
  tabIds: string[];
  active: number;
}

export interface InitialTabs {
  tabs: TabEntry[];
  activeId: string;
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

function readOpenScenes(): StoredOpenScenes {
  const stored = readStored(KEY) as Partial<StoredOpenScenes> | null;

  return {
    ids: strings(stored?.ids).slice(0, MAX_TABS),
    tabIds: strings(stored?.tabIds),
    active: typeof stored?.active === 'number' ? stored.active : 0,
  };
}

export function rememberOpenScenes(tabs: TabListItem[], activeId: string) {
  writeStored(KEY, {
    ids: tabs.map((t) => t.sceneId),
    tabIds: tabs.map((t) => t.id),
    active: Math.max(
      0,
      tabs.findIndex((t) => t.id === activeId),
    ),
  });
}

const fallbackTabId = (index: number) => (index === 0 ? FIRST_TAB : newTabId());

export function tabsFromSeeds(seeds: Array<WorkspaceSeed | null>, active: number, tabIds: string[] = []): InitialTabs {
  const found = seeds.flatMap((seed, i) => (seed ? [{ seed, wasActive: i === active, tabId: tabIds[i] }] : []));

  if (found.length === 0) return { tabs: [{ id: FIRST_TAB, seed: blankSeed({}) }], activeId: FIRST_TAB };

  const kept = new Set(found.map((f) => f.tabId).filter(Boolean));
  const keepIds = kept.size === found.length;
  const tabs = found.map(({ seed, tabId }, i) => ({
    id: keepIds && tabId ? tabId : fallbackTabId(i),
    seed,
  }));
  const activeIndex = Math.max(
    0,
    found.findIndex((f) => f.wasActive),
  );

  return { tabs, activeId: tabs[activeIndex].id };
}

export function useInitialTabs(): InitialTabs | null {
  const [initial, setInitial] = useState<InitialTabs | null>(null);

  useEffect(() => {
    const { ids, tabIds, active } = readOpenScenes();

    void Promise.all(ids.map(loadSceneSeed)).then((seeds) => setInitial(tabsFromSeeds(seeds, active, tabIds)));
  }, []);

  return initial;
}

interface PersistenceInput {
  handles: React.RefObject<Map<string, WorkspaceHandle>>;
  tabList: TabListItem[];
  activeId: string;
}

export function useScenePersistence({ handles, tabList, activeId }: PersistenceInput) {
  useEffect(() => rememberOpenScenes(tabList, activeId), [tabList, activeId]);

  useEffect(() => {
    const flushAll = () => handles.current.forEach((handle) => void handle.flush());

    window.addEventListener('beforeunload', flushAll);

    return () => window.removeEventListener('beforeunload', flushAll);
  }, [handles]);
}
