import { useEffect, useState } from 'react';
import type { WorkspaceHandle, WorkspaceSeed } from '../SceneWorkspace';
import { loadSceneSeed } from './sceneSeeds';
import { readStored, writeStored } from './storedSettings';
import { blankSeed, FIRST_TAB, MAX_TABS, newTabId, type TabEntry, type TabListItem } from './tabModel';

const KEY = 'open-scenes';

interface StoredOpenScenes {
  ids: string[];
  active: number;
}

export interface InitialTabs {
  tabs: TabEntry[];
  activeId: string;
}

function readOpenScenes(): StoredOpenScenes {
  const stored = readStored(KEY) as Partial<StoredOpenScenes> | null;
  const ids = Array.isArray(stored?.ids) ? stored.ids.filter((id) => typeof id === 'string') : [];

  return { ids: ids.slice(0, MAX_TABS), active: typeof stored?.active === 'number' ? stored.active : 0 };
}

export function rememberOpenScenes(tabs: TabListItem[], activeId: string) {
  writeStored(KEY, {
    ids: tabs.map((t) => t.sceneId),
    active: Math.max(
      0,
      tabs.findIndex((t) => t.id === activeId),
    ),
  });
}

export function tabsFromSeeds(seeds: Array<WorkspaceSeed | null>, active: number): InitialTabs {
  const found = seeds.flatMap((seed, i) => (seed ? [{ seed, wasActive: i === active }] : []));

  if (found.length === 0) return { tabs: [{ id: FIRST_TAB, seed: blankSeed({}) }], activeId: FIRST_TAB };

  const tabs = found.map(({ seed }, i) => ({ id: i === 0 ? FIRST_TAB : newTabId(), seed }));
  const activeIndex = Math.max(
    0,
    found.findIndex((f) => f.wasActive),
  );

  return { tabs, activeId: tabs[activeIndex].id };
}

export function useInitialTabs(): InitialTabs | null {
  const [initial, setInitial] = useState<InitialTabs | null>(null);

  useEffect(() => {
    const { ids, active } = readOpenScenes();

    void Promise.all(ids.map(loadSceneSeed)).then((seeds) => setInitial(tabsFromSeeds(seeds, active)));
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
