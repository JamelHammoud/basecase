import { useMemo } from 'react';
import type { StudioShared } from '../SceneWorkspace';
import type { useAgentConnection } from './useAgentConnection';
import type { useLibraries } from './useLibraries';
import type { usePanelLayout } from './usePanelLayout';
import type { usePreferences } from './usePreferences';
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
}

export function useStudio({ prefs, layout, libraries, agent, settings, core, actions, tabList }: StudioSources) {
  const { snapStepMm, setSnapStepMm, snapAngleDeg, trackpadMode, setTrackpadMode, showGrid, setShowGrid } = prefs;
  const { sculptEnabled, showReferenceImages, setShowReferenceImages } = prefs;
  const { isLeftOpen, setIsLeftOpen, isRightOpen, setIsRightOpen, panelWidths, setPanelWidths } = layout;
  const { resizingPanel, setResizingPanel, setRightIslandWidth } = layout;
  const { customModels, setCustomModels, savedScenes, setSavedScenes } = libraries;
  const { uploadedImages, setUploadedImages, chatList, setChatList } = libraries;
  const { acpStatus, reconnectAcp, agentTargetHeightMm } = agent;
  const { settingsOpen, openSettings } = settings;
  const { register, reportMeta, newScene, selectTab } = core;
  const { openScene, renameTab, closeTab, duplicateTab, reopenTab, cycleTab, focusChat, notify } = actions;
  const canReopenTab = core.closed.length > 0;

  return useMemo<StudioShared>(
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
      canReopenTab,
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
    [
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
      tabList,
      canReopenTab,
      register,
      reportMeta,
      setRightIslandWidth,
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
    ],
  );
}
