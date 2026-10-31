import { useState } from 'react';
import { SettingsWindow } from '../components/SettingsWindow';
import { SceneWorkspace } from '../SceneWorkspace';
import { useScenePersistence, type InitialTabs } from './openScenes';
import { DEFAULT_PANEL_WIDTHS } from './storedSettings';
import { tabListOf } from './tabModel';
import { TitleBarTabs } from './TitleBarTabs';
import { useAgentConnection } from './useAgentConnection';
import { useAppMenu } from './useAppMenu';
import { useBackendEvents } from './useBackendEvents';
import { useContentStable } from './useContentStable';
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

  useBackendEvents({
    setAcpStatus: agent.setAcpStatus,
    setCustomModels: libraries.setCustomModels,
    routeToScene: core.routeEvent,
  });
  useScenePersistence({ handles: core.handles, tabList, activeId: core.activeId });
  useAppMenu({
    commands: { ...core, ...actions, toggleSceneList: () => setScenesOpen((v) => !v) },
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
  });

  return (
    <div className="window-chrome relative w-screen h-screen overflow-hidden">
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
        autoGuide={prefs.autoGuide}
        onAutoGuide={prefs.setAutoGuide}
        pane={settings.pane}
        onPaneChange={settings.changePane}
        onClose={settings.closeSettings}
        showGrid={prefs.showGrid}
        onShowGrid={prefs.setShowGrid}
        snapStepMm={prefs.snapStepMm}
        onSnapStep={prefs.setSnapStepMm}
        snapAngleDeg={prefs.snapAngleDeg}
        onSnapAngle={prefs.setSnapAngleDeg}
        measureUnit={prefs.measureUnit}
        onMeasureUnit={prefs.setMeasureUnit}
        showReferenceImages={prefs.showReferenceImages}
        onShowReferenceImages={prefs.setShowReferenceImages}
        trackpadMode={prefs.trackpadMode}
        onTrackpadMode={prefs.setTrackpadMode}
        isLeftOpen={layout.isLeftOpen}
        onLeftOpen={layout.setIsLeftOpen}
        isRightOpen={layout.isRightOpen}
        onRightOpen={layout.setIsRightOpen}
        panelWidths={layout.panelWidths}
        onResetPanelWidths={() => layout.setPanelWidths({ ...DEFAULT_PANEL_WIDTHS })}
        acpStatus={agent.acpStatus}
        onReconnectAcp={agent.reconnectAcp}
        targetHeightMm={agent.agentTargetHeightMm}
        onTargetHeight={agent.setAgentTargetHeightMm}
        printers={printers}
      />
    </div>
  );
}
