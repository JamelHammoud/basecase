import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { SceneTabs, TAB_HEIGHT, TAB_TOP } from './components/SceneTabs';
import { SettingsPane, SettingsWindow } from './components/SettingsWindow';
import {
  Preferences,
  SceneWorkspace,
  StudioShared,
  WorkspaceHandle,
  WorkspaceMeta,
  WorkspaceSeed,
} from './SceneWorkspace';
import { newSceneId } from './utils/sceneIds';
import {
  AcpStatusInfo,
  AgentConversationSummary,
  CustomModelDefinition,
  ReferenceImageRecord,
  SavedSceneRecord,
  TrackpadGestureMode,
} from './types/robotics';
import { platformBridge } from './utils/platformBridge';
import { upgradeSceneRecord } from './utils/robotUpgrade';
import { useStoplights } from './utils/useStoplights';
import { IconButton, LAYOUT, NO_DRAG_REGION, ToastData } from './design-system';

/**
 * Open scenes stay mounted (each with a WebGL canvas and its own agent session), and
 * browsers cap WebGL contexts at about 16, so tabs stop well short of that.
 */
const MAX_TABS = 8;
/** Closed tabs ⇧⌘T can bring back */
const CLOSED_LIMIT = 10;
/** The first tab; agent callers without a workspace id (bench, parts generator) talk to it */
const FIRST_TAB = 'main';

const DEFAULT_PREFERENCES: Preferences = { snapStepMm: 5, snapAngleDeg: 15, trackpadMode: 'orbit-scroll', showGrid: true, sculptEnabled: false };

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('preferences') || 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_PREFERENCES, ...saved };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PREFERENCES;
}

/** A blank scene, numbered so open tabs don't share a name (“Untitled 2”) */
function blankSeed(metas: Record<string, WorkspaceMeta>, closing: string[] = []): WorkspaceSeed {
  const names = new Set(Object.entries(metas).filter(([id]) => !closing.includes(id)).map(([, m]) => m.name));
  let sceneName = 'Untitled';
  for (let n = 2; names.has(sceneName); n++) sceneName = `Untitled ${n}`;
  return { sceneId: newSceneId(), sceneName, globalGoal: '', parts: [], annotations: [], blank: true };
}

/** Sidebar toggle: 28px, 8px after the stoplights' bounding box (x 19–79) */
const TOGGLE_LEFT = LAYOUT.lightsX + LAYOUT.lightsWidth + 8;
/** Without stoplights (browser, full screen) the toggle centers on the rail column, x = 26 */
const TOGGLE_LEFT_BARE = 26 - 14;

const newTabId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

interface TabEntry {
  id: string;
  seed?: WorkspaceSeed;
}

interface ClosedTab {
  seed: WorkspaceSeed;
  index: number;
}

/**
 * Scene tabs. Each tab is a full `SceneWorkspace` (parts, history, comments, agent chat);
 * this host owns what they share: preferences, panel layout, libraries, the agent
 * connection, Settings, and routing agent events to the scene they belong to.
 */
export function App() {
  /* Tabs */
  const [tabs, setTabs] = useState<TabEntry[]>([{ id: FIRST_TAB }]);
  const [activeId, setActiveId] = useState(FIRST_TAB);
  const [metas, setMetas] = useState<Record<string, WorkspaceMeta>>({});
  // Last frame of each background scene, for the tab preview card
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<ClosedTab[]>([]);
  const handles = useRef(new Map<string, WorkspaceHandle>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const metasRef = useRef(metas);
  metasRef.current = metas;
  const closedRef = useRef(closed);
  closedRef.current = closed;

  /* Preferences (Settings window, remembered between launches) */
  const [savedPrefs] = useState(loadPreferences);
  const [snapStepMm, setSnapStepMm] = useState<number>(savedPrefs.snapStepMm);
  const [snapAngleDeg, setSnapAngleDeg] = useState<number>(savedPrefs.snapAngleDeg);
  const [trackpadMode, setTrackpadMode] = useState<TrackpadGestureMode>(savedPrefs.trackpadMode);
  const [showGrid, setShowGrid] = useState<boolean>(savedPrefs.showGrid);
  const [sculptEnabled, setSculptEnabled] = useState<boolean>(savedPrefs.sculptEnabled);
  useEffect(() => {
    try {
      localStorage.setItem('preferences', JSON.stringify({ snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled }));
    } catch {
      /* storage unavailable */
    }
  }, [snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled]);
  // View setting (not undoable): hides every reference photo at once
  const [showReferenceImages, setShowReferenceImages] = useState(true);

  /* Panels (same layout in every scene) */
  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(true);
  const [isRightOpen, setIsRightOpen] = useState<boolean>(true);
  const [panelWidths, setPanelWidths] = useState<{ left: number; right: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('panel-widths') || 'null');
      if (saved && typeof saved.left === 'number' && typeof saved.right === 'number') return saved;
    } catch {
      /* storage unavailable */
    }
    return { left: LAYOUT.leftPanelWidth, right: LAYOUT.rightPanelWidth };
  });
  const [resizingPanel, setResizingPanel] = useState<'left' | 'right' | null>(null);
  const hasStoplights = useStoplights();
  useEffect(() => {
    try {
      localStorage.setItem('panel-widths', JSON.stringify(panelWidths));
    } catch {
      /* storage unavailable */
    }
  }, [panelWidths]);
  const [rightIslandWidth, setRightIslandWidth] = useState(200);

  /* Libraries */
  const [customModels, setCustomModels] = useState<CustomModelDefinition[]>([]);
  const [savedScenes, setSavedScenes] = useState<SavedSceneRecord[]>([]);
  const [uploadedImages, setUploadedImages] = useState<ReferenceImageRecord[]>([]);
  const [chatList, setChatList] = useState<AgentConversationSummary[]>([]);

  /* Agent connection (each scene has its own session on it) */
  const [acpStatus, setAcpStatus] = useState<AcpStatusInfo>({
    connected: false,
    sessionId: null,
    agentName: 'Basecase Offline Agent',
    agentCommand: 'node electron/acp-3d-agent.mjs',
  });
  // Overall model height sent with each agent message (Settings → Agent); 0 lets the agent estimate it
  const [agentTargetHeightMm, setAgentTargetHeightMm] = useState(0);
  const reconnectAcp = useCallback(async (command?: string) => {
    setAcpStatus(await platformBridge.connectAcp(command));
  }, []);

  /* Settings */
  const [settingsPane, setSettingsPane] = useState<SettingsPane | null>(null);
  const [lastSettingsPane, setLastSettingsPane] = useState<SettingsPane>('canvas');
  const settingsOpen = settingsPane !== null;
  const lastSettingsPaneRef = useRef(lastSettingsPane);
  lastSettingsPaneRef.current = lastSettingsPane;
  const openSettings = useCallback((pane?: SettingsPane) => setSettingsPane(pane ?? lastSettingsPaneRef.current), []);

  /* ---------------------------------------------------------------- */
  /* Bridge: shared events here, scene events to their tab            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    platformBridge.getAcpStatus().then(setAcpStatus).catch(() => {});
    platformBridge.listModels().then(setCustomModels).catch(() => {});
    platformBridge
      .listScenes()
      .then(async (scenes) => {
        setSavedScenes(scenes);
        // Saved scenes with robots imported before imports captured all of the maker's data:
        // upgrade them from their descriptions and save them back in place (one at a time)
        let changed = false;
        for (const record of scenes) {
          const next = await upgradeSceneRecord(record).catch(() => null);
          if (!next) continue;
          // No thumbnail: the backend would copy it over ai-reference/preview.png
          await platformBridge.saveScene({ ...next, thumbnailDataUrl: undefined, keepUpdatedAt: true }).catch(() => {});
          changed = true;
        }
        if (changed) setSavedScenes(await platformBridge.listScenes());
      })
      .catch(() => {});
    platformBridge.listImages().then(setUploadedImages).catch(() => {});
    platformBridge.listChats().then(setChatList).catch(() => {});

    return platformBridge.subscribeEvents((event) => {
      switch (event.type) {
        case 'acp-status':
          if (event.status) setAcpStatus(event.status as AcpStatusInfo);
          return;
        case 'library-models-changed':
          if (Array.isArray(event.models)) setCustomModels(event.models as CustomModelDefinition[]);
          return;
        case 'library-scenes-changed':
          if (Array.isArray(event.scenes)) setSavedScenes(event.scenes as SavedSceneRecord[]);
          return;
        case 'acp-file-written':
          if (Array.isArray(event.models)) setCustomModels(event.models as CustomModelDefinition[]);
          if (Array.isArray(event.scenes)) setSavedScenes(event.scenes as SavedSceneRecord[]);
          return;
      }
      // Scene events carry their tab's id; requests without one (dev tools) go to the scene in front
      const target = typeof event.workspaceId === 'string' ? event.workspaceId : activeRef.current;
      const handle = handles.current.get(target);
      if (handle) {
        handle.onEvent(event);
      } else if (event.type === 'agent-request' && typeof event.requestId === 'string') {
        // The tab closed while its agent was mid-call
        platformBridge.respondToAgent({ requestId: event.requestId, error: 'This scene was closed.' }).catch(() => {});
      }
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Tab actions                                                      */
  /* ---------------------------------------------------------------- */

  const register = useCallback((id: string, handle: WorkspaceHandle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  }, []);

  const reportMeta = useCallback((id: string, meta: WorkspaceMeta) => {
    setMetas((prev) => ({ ...prev, [id]: meta }));
  }, []);

  const toastInFront = useCallback((message: string, opts?: Omit<ToastData, 'id' | 'message'>) => {
    handles.current.get(activeRef.current)?.toast(message, opts);
  }, []);

  /** Keeps a preview frame of the scene in front before it goes to the back */
  const captureFront = useCallback(() => {
    const prev = activeRef.current;
    handles.current
      .get(prev)
      ?.thumbnail()
      .then((url) => url && setThumbs((t) => ({ ...t, [prev]: url })))
      .catch(() => {});
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      if (id === activeRef.current || !tabsRef.current.some((t) => t.id === id)) return;
      captureFront();
      setActiveId(id);
    },
    [captureFront]
  );

  /** Opens a new tab after the one in front (or at `index`) */
  const openTab = useCallback(
    (seed?: WorkspaceSeed, index?: number) => {
      if (tabsRef.current.length >= MAX_TABS) {
        toastInFront(`Close a scene to open another. Up to ${MAX_TABS} stay open.`, { tone: 'error' });
        return null;
      }
      const id = newTabId();
      setTabs((prev) => {
        const at = index ?? prev.findIndex((t) => t.id === activeRef.current) + 1;
        const next = [...prev];
        next.splice(Math.max(0, Math.min(at, next.length)), 0, { id, seed });
        return next;
      });
      captureFront();
      setActiveId(id);
      return id;
    },
    [captureFront, toastInFront]
  );

  const newScene = useCallback((seed?: WorkspaceSeed) => void openTab(seed ?? blankSeed(metasRef.current)), [openTab]);

  /** Fresh frame for a background tab's preview card (it renders on demand while paused) */
  const refreshPreview = useCallback((id: string) => {
    handles.current
      .get(id)
      ?.thumbnail()
      .then((url) => url && setThumbs((t) => ({ ...t, [id]: url })))
      .catch(() => {});
  }, []);

  /** Library → open: shows its tab if open, reuses an untouched tab, otherwise opens a new one */
  const openScene = useCallback(
    (record: SavedSceneRecord) => {
      const seed: WorkspaceSeed = {
        sceneId: record.id,
        sceneName: record.name,
        globalGoal: record.globalGoal || '',
        parts: record.parts || [],
        annotations: record.annotations || [],
        project: record.project,
      };
      const open = tabsRef.current.find((t) => metasRef.current[t.id]?.sceneId === record.id);
      if (open) {
        selectTab(open.id);
        return;
      }
      const current = activeRef.current;
      if (metasRef.current[current]?.pristine) {
        handles.current.get(current)?.load(seed, `Opened ${record.name}`);
        return;
      }
      if (openTab(seed)) window.setTimeout(() => toastInFront(`Opened ${record.name}`), 0);
    },
    [openTab, selectTab, toastInFront]
  );

  /** Closes tabs (a fresh scene replaces the last one); Undo reopens them where they were */
  const closeTabs = useCallback(
    (ids: string[]) => {
      const list = tabsRef.current;
      const closing = list.filter((t) => ids.includes(t.id));
      if (closing.length === 0) return;
      const remember: ClosedTab[] = [];
      let stoppedAgent = false;
      for (const tab of closing) {
        const handle = handles.current.get(tab.id);
        const meta = metasRef.current[tab.id];
        if (meta?.busy) {
          stoppedAgent = true;
          handle?.stopAgent();
        }
        handle?.persistChat();
        if (handle && !meta?.pristine) remember.push({ seed: handle.snapshot(), index: list.indexOf(tab) });
        platformBridge.closeAcpWorkspace(tab.id);
      }
      let remaining = list.filter((t) => !ids.includes(t.id));
      // Closing the last scene leaves a blank one; Undo takes it away again if it's still untouched
      const replacement = remaining.length === 0 ? { id: newTabId(), seed: blankSeed(metasRef.current, ids) } : null;
      if (replacement) remaining = [replacement];
      // The tab in front closed: show its right neighbour, or the left one at the end
      let nextActive = activeRef.current;
      if (ids.includes(nextActive)) {
        const from = list.findIndex((t) => t.id === nextActive);
        const after = list.slice(from + 1).find((t) => !ids.includes(t.id));
        const before = list.slice(0, from).reverse().find((t) => !ids.includes(t.id));
        nextActive = (after ?? before ?? remaining[0]).id;
      }
      setTabs(remaining);
      setActiveId(nextActive);
      setMetas((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      setThumbs((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
      if (remember.length === 0) return;
      setClosed((prev) => [...prev, ...remember].slice(-CLOSED_LIMIT));
      const name = remember.length === 1 ? remember[0].seed.sceneName : `${remember.length} scenes`;
      // The scene now in front mounts its handle after this render
      window.setTimeout(
        () =>
          toastInFront(stoppedAgent ? `Closed ${name} and stopped its agent` : `Closed ${name}`, {
            tone: 'neutral',
            action: {
              label: 'Undo',
              onClick: () => {
                setClosed((prev) => prev.filter((c) => !remember.includes(c)));
                remember.forEach((c) => openTab(c.seed, c.index));
                if (replacement && metasRef.current[replacement.id]?.pristine) {
                  setTabs((prev) => prev.filter((t) => t.id !== replacement.id));
                  setMetas(({ [replacement.id]: _gone, ...rest }) => rest);
                  platformBridge.closeAcpWorkspace(replacement.id);
                }
              },
            },
          }),
        0
      );
    },
    [openTab, toastInFront]
  );

  const closeTab = useCallback((id: string) => closeTabs([id]), [closeTabs]);

  const reopenTab = useCallback(() => {
    const last = closedRef.current[closedRef.current.length - 1];
    if (!last) return;
    setClosed((prev) => prev.slice(0, -1));
    openTab(last.seed, last.index);
  }, [openTab]);

  /** A copy of the scene in a new tab (the agent conversation stays with the original) */
  const duplicateTab = useCallback(
    (id: string) => {
      const snap = handles.current.get(id)?.snapshot();
      if (!snap) return;
      const at = tabsRef.current.findIndex((t) => t.id === id) + 1;
      openTab({ ...snap, sceneId: newSceneId(), sceneName: `${snap.sceneName} Copy`, chat: undefined }, at);
    },
    [openTab]
  );

  const cycleTab = useCallback(
    (step: number) => {
      const list = tabsRef.current;
      if (list.length < 2) return;
      const i = list.findIndex((t) => t.id === activeRef.current);
      selectTab(list[(i + step + list.length) % list.length].id);
    },
    [selectTab]
  );

  const reorderTab = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const renameTab = useCallback((id: string, name: string) => handles.current.get(id)?.rename(name), []);

  const focusChat = useCallback(
    (chatId: string, from: string) => {
      const owner = tabsRef.current.find((t) => t.id !== from && metasRef.current[t.id]?.chatId === chatId);
      if (!owner) return false;
      selectTab(owner.id);
      return true;
    },
    [selectTab]
  );

  const notify = useCallback(
    (from: string, message: string) => {
      if (from === activeRef.current) return;
      toastInFront(message, { tone: 'success', action: { label: 'Show', onClick: () => selectTab(from) } });
    },
    [selectTab, toastInFront]
  );

  /* ---------------------------------------------------------------- */
  /* Keyboard and menu bar                                            */
  /* ---------------------------------------------------------------- */

  const runTabCommand = useCallback(
    (id: string) => {
      if (id.startsWith('tab:')) return selectTab(id.slice(4)), true;
      switch (id) {
        case 'new-scene': return newScene(), true;
        case 'close-tab': return closeTab(activeRef.current), true;
        case 'reopen-tab': return reopenTab(), true;
        case 'next-tab': return cycleTab(1), true;
        case 'prev-tab': return cycleTab(-1), true;
      }
      return false;
    },
    [newScene, closeTab, reopenTab, cycleTab, selectTab]
  );

  useEffect(() => platformBridge.onMenuCommand((id) => void runTabCommand(id)), [runTabCommand]);

  useEffect(() => {
    // Browser-style tab keys; they work while typing too
    const onKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      let command: string | null = null;
      if (e.ctrlKey && e.key === 'Tab') command = e.shiftKey ? 'prev-tab' : 'next-tab';
      else if (mod && e.shiftKey && e.code === 'BracketRight') command = 'next-tab';
      else if (mod && e.shiftKey && e.code === 'BracketLeft') command = 'prev-tab';
      else if (mod && !e.altKey && key === 't') command = e.shiftKey ? 'reopen-tab' : 'new-scene';
      else if (mod && !e.shiftKey && !e.altKey && key === 'w') command = 'close-tab';
      else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        // ⌘9 is always the last tab, like a browser
        const list = tabsRef.current;
        const target = e.key === '9' ? list[list.length - 1] : list[Number(e.key) - 1];
        if (target) command = `tab:${target.id}`;
      }
      if (!command) return;
      e.preventDefault();
      runTabCommand(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runTabCommand, settingsOpen]);

  const tabList = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        name: metas[t.id]?.name ?? t.seed?.sceneName ?? 'Untitled',
        sceneId: metas[t.id]?.sceneId ?? t.seed?.sceneId ?? '',
      })),
    // Only names and scene ids matter here; agent activity in metas changes often
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs, tabs.map((t) => `${metas[t.id]?.name}\u0001${metas[t.id]?.sceneId}`).join('\u0000')]
  );

  useEffect(() => {
    platformBridge.setMenuState({ tabs: tabList, activeTab: activeId, canReopenTab: closed.length > 0 });
  }, [tabList, activeId, closed.length]);

  /* ---------------------------------------------------------------- */
  /* Shared studio                                                    */
  /* ---------------------------------------------------------------- */

  const studio = useMemo<StudioShared>(
    () => ({
      snapStepMm,
      setSnapStepMm,
      snapAngleDeg,
      trackpadMode,
      setTrackpadMode,
      showGrid,
      setShowGrid,
      sculptEnabled,
      showReferenceImages,
      setShowReferenceImages,
      isLeftOpen,
      setIsLeftOpen,
      isRightOpen,
      setIsRightOpen,
      panelWidths,
      setPanelWidths,
      resizingPanel,
      setResizingPanel,
      customModels,
      setCustomModels,
      savedScenes,
      setSavedScenes,
      uploadedImages,
      setUploadedImages,
      chatList,
      setChatList,
      acpStatus,
      reconnectAcp,
      agentTargetHeightMm,
      settingsOpen,
      openSettings,
      tabs: tabList,
      canReopenTab: closed.length > 0,
      register,
      reportMeta,
      reportRightIsland: setRightIslandWidth,
      newScene,
      openScene,
      selectTab,
      renameTab,
      closeTab,
      duplicateTab,
      reopenTab,
      cycleTab,
      focusChat,
      notify,
    }),
    [snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled, showReferenceImages, isLeftOpen, isRightOpen, panelWidths, resizingPanel, customModels, savedScenes, uploadedImages, chatList, acpStatus, reconnectAcp, agentTargetHeightMm, settingsOpen, openSettings, tabList, closed.length, register, reportMeta, newScene, openScene, selectTab, renameTab, closeTab, duplicateTab, reopenTab, cycleTab, focusChat, notify]
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  // Tabs run along the title bar from 8px after the sidebar toggle to 8px before the scene's
  // actions, which end at x = width − 20 (sheet inset + card padding)
  const toggleLeft = hasStoplights ? TOGGLE_LEFT : TOGGLE_LEFT_BARE;
  const rowLeft = toggleLeft + 28 + 8;
  const slide = resizingPanel ? '' : 'transition-[left,right] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]';
  const rowRight = LAYOUT.sheetInset + LAYOUT.cardPadding + rightIslandWidth + 8;

  return (
    <div className="window-chrome relative w-screen h-screen overflow-hidden">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`absolute inset-0 ${active ? '' : 'invisible pointer-events-none'}`}
            inert={!active}
            aria-hidden={!active}
          >
            <SceneWorkspace workspaceId={tab.id} active={active} seed={tab.seed} studio={studio} />
          </div>
        );
      })}

      {/* Title bar: stoplights, then the sidebar toggle; everything centers on y = 22 */}
      <div className={`absolute top-[8px] z-30 h-[28px] flex items-center ${slide}`} style={{ ...NO_DRAG_REGION, left: toggleLeft }}>
        <IconButton
          icon={<PanelLeft className="w-4 h-4" />}
          title={isLeftOpen ? 'Hide sidebar' : 'Show sidebar'}
          shortcut="⌘B"
          onClick={() => setIsLeftOpen((v) => !v)}
        />
      </div>

      <div
        className={`absolute z-30 flex items-stretch pointer-events-none [&>*]:pointer-events-auto ${slide}`}
        style={{ top: TAB_TOP, left: rowLeft, right: rowRight, height: TAB_HEIGHT }}
      >
        <SceneTabs
          tabs={tabs.map((t) => {
            const meta = metas[t.id];
            return {
              id: t.id,
              name: meta?.name ?? t.seed?.sceneName ?? 'Untitled',
              partCount: meta?.partCount ?? t.seed?.parts.length ?? 0,
              busy: !!meta?.busy,
              activity: meta?.activity ?? '',
            };
          })}
          activeId={activeId}
          previews={thumbs}
          canReopen={closed.length > 0}
          onSelect={selectTab}
          onNew={() => newScene()}
          onClose={closeTab}
          onCloseOthers={(id) => closeTabs(tabs.filter((t) => t.id !== id).map((t) => t.id))}
          onCloseRight={(id) => closeTabs(tabs.slice(tabs.findIndex((t) => t.id === id) + 1).map((t) => t.id))}
          onDuplicate={duplicateTab}
          onRename={renameTab}
          onReorder={reorderTab}
          onReopen={reopenTab}
          onPreview={refreshPreview}
        />
      </div>

      <SettingsWindow
        open={settingsOpen}
        sculptEnabled={sculptEnabled}
        onSculptEnabled={setSculptEnabled}
        pane={settingsPane ?? lastSettingsPane}
        onPaneChange={(pane) => {
          setSettingsPane(pane);
          setLastSettingsPane(pane);
        }}
        onClose={() => setSettingsPane(null)}
        showGrid={showGrid}
        onShowGrid={setShowGrid}
        snapStepMm={snapStepMm}
        onSnapStep={setSnapStepMm}
        snapAngleDeg={snapAngleDeg}
        onSnapAngle={setSnapAngleDeg}
        showReferenceImages={showReferenceImages}
        onShowReferenceImages={setShowReferenceImages}
        trackpadMode={trackpadMode}
        onTrackpadMode={setTrackpadMode}
        isLeftOpen={isLeftOpen}
        onLeftOpen={setIsLeftOpen}
        isRightOpen={isRightOpen}
        onRightOpen={setIsRightOpen}
        panelWidths={panelWidths}
        onResetPanelWidths={() => setPanelWidths({ left: LAYOUT.leftPanelWidth, right: LAYOUT.rightPanelWidth })}
        acpStatus={acpStatus}
        onReconnectAcp={reconnectAcp}
        targetHeightMm={agentTargetHeightMm}
        onTargetHeight={setAgentTargetHeightMm}
      />
    </div>
  );
}

export default App;
