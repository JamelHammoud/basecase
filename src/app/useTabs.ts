import { useRef, useState } from 'react';
import type { WorkspaceHandle, WorkspaceMeta, WorkspaceSeed } from '../SceneWorkspace';
import type { ToastData } from '../design-system';
import { platformBridge } from '../utils/platformBridge';
import {
  blankSeed,
  FIRST_TAB,
  insertTab,
  MAX_TABS,
  newTabId,
  type ClosedTab,
  type Metas,
  type TabEntry,
} from './tabModel';
import { useLatest } from './useLatest';

export type ToastOptions = Omit<ToastData, 'id' | 'message'>;

export function useTabs() {
  const [tabs, setTabs] = useState<TabEntry[]>([{ id: FIRST_TAB }]);
  const [activeId, setActiveId] = useState(FIRST_TAB);
  const [metas, setMetas] = useState<Metas>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<ClosedTab[]>([]);
  const handles = useRef(new Map<string, WorkspaceHandle>());
  const latestRef = useLatest({ tabs, activeId, metas, closed });

  const register = (id: string, handle: WorkspaceHandle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  };

  const reportMeta = (id: string, meta: WorkspaceMeta) => {
    setMetas((prev) => ({ ...prev, [id]: meta }));
  };

  const toastInFront = (message: string, opts?: ToastOptions) => {
    handles.current.get(latestRef.current.activeId)?.toast(message, opts);
  };

  const capturePreview = (id: string) => {
    handles.current
      .get(id)
      ?.thumbnail()
      .then((url) => url && setThumbs((t) => ({ ...t, [id]: url })))
      .catch(() => {});
  };

  const selectTab = (id: string) => {
    const { tabs: list, activeId: current } = latestRef.current;

    if (id === current || !list.some((t) => t.id === id)) return;

    capturePreview(current);
    setActiveId(id);
  };

  const openTab = (seed?: WorkspaceSeed, index?: number) => {
    const { tabs: list, activeId: current } = latestRef.current;

    if (list.length >= MAX_TABS) {
      toastInFront(`Close a scene to open another. Up to ${MAX_TABS} stay open.`, { tone: 'error' });

      return null;
    }

    const id = newTabId();

    setTabs((prev) => insertTab(prev, { id, seed }, index ?? prev.findIndex((t) => t.id === current) + 1));
    capturePreview(current);
    setActiveId(id);

    return id;
  };

  const newScene = (seed?: WorkspaceSeed) => void openTab(seed ?? blankSeed(latestRef.current.metas));

  const routeEvent = (event: Record<string, unknown>) => {
    const target = typeof event.workspaceId === 'string' ? event.workspaceId : activeId;
    const handle = handles.current.get(target);

    if (handle) {
      handle.onEvent(event);

      return;
    }

    if (event.type === 'agent-request' && typeof event.requestId === 'string') {
      platformBridge.respondToAgent({ requestId: event.requestId, error: 'This scene was closed.' }).catch(() => {});
    }
  };

  return {
    tabs,
    setTabs,
    activeId,
    setActiveId,
    metas,
    setMetas,
    thumbs,
    setThumbs,
    closed,
    setClosed,
    handles,
    latestRef,
    register,
    reportMeta,
    toastInFront,
    capturePreview,
    selectTab,
    openTab,
    newScene,
    routeEvent,
  };
}

export type TabsCore = ReturnType<typeof useTabs>;
