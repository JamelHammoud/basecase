import { useMemo } from 'react';
import type { StudioShared } from '../SceneWorkspace';
import type { useAgentConnection } from './useAgentConnection';
import type { useLibraries } from './useLibraries';
import type { usePanelLayout } from './usePanelLayout';
import type { usePreferences } from './usePreferences';
import type { PrintersState } from './usePrinters';
import type { useSettingsPane } from './useSettingsPane';
import type { useTabActions } from './useTabActions';
import type { TabsCore } from './useTabs';
import type { TabListItem } from './tabModel';

export interface StudioSources {
  prefs: ReturnType<typeof usePreferences>;
  layout: ReturnType<typeof usePanelLayout>;
  libraries: ReturnType<typeof useLibraries>;
  agent: ReturnType<typeof useAgentConnection>;
  settings: ReturnType<typeof useSettingsPane>;
  core: TabsCore;
  actions: ReturnType<typeof useTabActions>;
  tabList: TabListItem[];
  openSceneList: () => void;
  printers: PrintersState;
}

export function useStudio(sources: StudioSources) {
  const { prefs, layout, libraries, agent, settings, core, actions, tabList, openSceneList, printers } = sources;
  const { snapStepMm, setSnapStepMm, snapAngleDeg, trackpadMode, setTrackpadMode, showGrid, setShowGrid } = prefs;
  const { sculptEnabled, measureUnit, showReferenceImages, setShowReferenceImages } = prefs;
  const { isLeftOpen, setIsLeftOpen, isRightOpen, setIsRightOpen, panelWidths, setPanelWidths } = layout;
  const { resizingPanel, setResizingPanel, setRightIslandWidth } = layout;
  const { customModels, setCustomModels, uploadedImages, setUploadedImages, chatList, setChatList } = libraries;
  const { acpStatus, reconnectAcp, signInAcp, saveAgentApiKey, agentTargetHeightMm, agentChoice, setAgentChoice } =
    agent;
  const { register, reportMeta, newScene, selectTab } = core;
  const { renameTab, closeTab, duplicateTab, reopenTab, cycleTab, focusChat, notify } = actions;
  const canReopenTab = core.closed.length > 0;

  return useMemo<StudioShared>(
    () => ({
      snapStepMm,
      setSnapStepMm,
      snapAngleDeg,
      measureUnit,
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
      uploadedImages,
      setUploadedImages,
      chatList,
      setChatList,
      acpStatus,
      reconnectAcp,
      signInAcp,
      saveAgentApiKey,
      agentTargetHeightMm,
      agentChoice,
      setAgentChoice,
      settingsOpen: settings.settingsOpen,
      openSettings: settings.openSettings,
      printers,
      tabs: tabList,
      canReopenTab,
      register,
      reportMeta,
      reportRightIsland: setRightIslandWidth,
      newScene,
      openSceneList,
      selectTab,
      renameTab,
      closeTab,
      duplicateTab,
      reopenTab,
      cycleTab,
      focusChat,
      notify,
    }),
    [
      snapStepMm,
      setSnapStepMm,
      snapAngleDeg,
      measureUnit,
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
      uploadedImages,
      setUploadedImages,
      chatList,
      setChatList,
      acpStatus,
      reconnectAcp,
      signInAcp,
      saveAgentApiKey,
      agentTargetHeightMm,
      agentChoice,
      setAgentChoice,
      settings.settingsOpen,
      settings.openSettings,
      printers,
      tabList,
      canReopenTab,
      register,
      reportMeta,
      setRightIslandWidth,
      newScene,
      openSceneList,
      selectTab,
      renameTab,
      closeTab,
      duplicateTab,
      reopenTab,
      cycleTab,
      focusChat,
      notify,
    ],
  );
}
