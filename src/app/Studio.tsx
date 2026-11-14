import { useState } from 'react';
import { SettingsWindow } from '../components/SettingsWindow';
import { SceneWorkspace } from '../SceneWorkspace';
import { useScenePersistence, type InitialTabs } from './openScenes';
import { tabListOf } from './tabModel';
import { TitleBarTabs } from './TitleBarTabs';
import { useAgentConnection } from './useAgentConnection';
import { useAppMenu } from './useAppMenu';
import { useBackendEvents } from './useBackendEvents';
import { useContentStable } from './useContentStable';
import { useDevTabsHook } from './useDevTabsHook';
import { useLibraries } from './useLibraries';
import { useMountedTabs } from './useMountedTabs';
import { usePanelLayout } from './usePanelLayout';
import { usePreferences } from './usePreferences';
import { usePrinters } from './usePrinters';
import { useSceneLibrary } from './useSceneLibrary';
import { useSettingsPane } from './useSettingsPane';
import { useStudio } from './useStudio';
import { useTabActions } from './useTabActions';
import { useTabs } from './useTabs';

export function Studio({ initial }: { initial: InitialTabs }) {
  const core = useTabs(initial);
  const actions = useTabActions(core);
  const sceneLibrary = useSceneLibrary(core, actions);
  const [scenesOpen, setScenesOpen] = useState(false);
  const prefs = usePreferences();
  const layout = usePanelLayout();
  const libraries = useLibraries();
  const agent = useAgentConnection();
  const settings = useSettingsPane();
  const printers = usePrinters();
  const tabList = useContentStable(tabListOf(core.tabs, core.metas));
  const canReopenTab = core.closed.length > 0;
  const isMounted = useMountedTabs(core.tabs, core.activeId);

  useDevTabsHook(core);
  useBackendEvents({
    setAcpStatus: agent.setAcpStatus,
    setCustomModels: libraries.setCustomModels,
    routeToScene: core.routeEvent,
  });
  useScenePersistence({ handles: core.handles, tabList, activeId: core.activeId });
  useAppMenu({
    commands: {
      ...core,
      ...actions,
      toggleSceneList: () => setScenesOpen((v) => !v),
      openSceneFile: () => void sceneLibrary.openSceneFile(),
    },
    tabList,
    canReopenTab,
    settingsOpen: settings.settingsOpen,
  });

  const openSceneList = () => setScenesOpen(true);
  const studio = useStudio({
    prefs,
    layout,
    libraries,
    agent,
    settings,
    core,
    actions,
    tabList,
    openSceneList,
    printers,
    sceneLibrary,
  });

  return (
    <div className="window-chrome relative w-full h-full overflow-hidden">
      {core.tabs.map((tab) => {
        const active = tab.id === core.activeId;

        return (
          <div
            key={tab.id}
            className={`absolute inset-0 ${active ? '' : 'invisible pointer-events-none'}`}
            inert={!active}
            aria-hidden={!active}
          >
            {isMounted(tab.id) && (
              <SceneWorkspace workspaceId={tab.id} active={active} seed={tab.seed} studio={studio} />
            )}
          </div>
        );
      })}

      <TitleBarTabs
        tabs={core.tabs}
        metas={core.metas}
        activeId={core.activeId}
        previews={core.thumbs}
        canReopen={canReopenTab}
        isLeftOpen={layout.isLeftOpen}
        leftWidth={layout.panelWidths.left}
        onToggleLeft={() => layout.setIsLeftOpen((v) => !v)}
        resizing={!!layout.resizingPanel}
        rightIslandWidth={layout.rightIslandWidth}
        actions={{ ...core, ...actions }}
        scenes={{
          open: scenesOpen,
          onOpenChange: setScenesOpen,
          currentSceneId: core.metas[core.activeId]?.sceneId ?? '',
          onOpenScene: actions.openScene,
          onRenameScene: sceneLibrary.renameScene,
          onDuplicateScene: sceneLibrary.duplicateScene,
          onDeleteScene: sceneLibrary.deleteScene,
        }}
      />

      <SettingsWindow
        open={settings.settingsOpen}
        sculptEnabled={prefs.sculptEnabled}
        onSculptEnabled={prefs.setSculptEnabled}
        buildPrefs={prefs}
        pane={settings.pane}
        focus={settings.focus}
        onPaneChange={settings.changePane}
        onClose={settings.closeSettings}
        snapStepMm={prefs.snapStepMm}
        onSnapStep={prefs.setSnapStepMm}
        snapAngleDeg={prefs.snapAngleDeg}
        onSnapAngle={prefs.setSnapAngleDeg}
        measureUnit={prefs.measureUnit}
        onMeasureUnit={prefs.setMeasureUnit}
        trackpadMode={prefs.trackpadMode}
        onTrackpadMode={prefs.setTrackpadMode}
        acpStatus={agent.acpStatus}
        onReconnectAcp={agent.reconnectAcp}
        printers={printers}
      />
    </div>
  );
}
