import { SettingsWindow } from './components/SettingsWindow';
import { SceneWorkspace } from './SceneWorkspace';
import { DEFAULT_PANEL_WIDTHS } from './app/storedSettings';
import { tabListOf } from './app/tabModel';
import { TitleBarTabs } from './app/TitleBarTabs';
import { useAgentConnection } from './app/useAgentConnection';
import { useAppMenu } from './app/useAppMenu';
import { useBackendEvents } from './app/useBackendEvents';
import { useContentStable } from './app/useContentStable';
import { useLibraries } from './app/useLibraries';
import { usePanelLayout } from './app/usePanelLayout';
import { usePreferences } from './app/usePreferences';
import { useSettingsPane } from './app/useSettingsPane';
import { useStudio } from './app/useStudio';
import { useTabActions } from './app/useTabActions';
import { useTabs } from './app/useTabs';

export function App() {
  const core = useTabs();
  const actions = useTabActions(core);
  const prefs = usePreferences();
  const layout = usePanelLayout();
  const libraries = useLibraries();
  const agent = useAgentConnection();
  const settings = useSettingsPane();
  const tabList = useContentStable(tabListOf(core.tabs, core.metas));
  const canReopenTab = core.closed.length > 0;

  useBackendEvents({
    setAcpStatus: agent.setAcpStatus,
    setCustomModels: libraries.setCustomModels,
    setSavedScenes: libraries.setSavedScenes,
    routeToScene: core.routeEvent,
  });
  useAppMenu({
    commands: { ...core, ...actions },
    tabList,
    canReopenTab,
    settingsOpen: settings.settingsOpen,
  });

  const studio = useStudio({ prefs, layout, libraries, agent, settings, core, actions, tabList });

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
            <SceneWorkspace workspaceId={tab.id} active={active} seed={tab.seed} studio={studio} />
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
      />

      <SettingsWindow
        open={settings.settingsOpen}
        sculptEnabled={prefs.sculptEnabled}
        onSculptEnabled={prefs.setSculptEnabled}
        pane={settings.pane}
        onPaneChange={settings.changePane}
        onClose={settings.closeSettings}
        showGrid={prefs.showGrid}
        onShowGrid={prefs.setShowGrid}
        snapStepMm={prefs.snapStepMm}
        onSnapStep={prefs.setSnapStepMm}
        snapAngleDeg={prefs.snapAngleDeg}
        onSnapAngle={prefs.setSnapAngleDeg}
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
      />
    </div>
  );
}

export default App;
