import { useMemo } from 'react';
import type { StudioShared } from '../SceneWorkspace';
import type { useAgentConnection } from './useAgentConnection';
import type { useLibraries } from './useLibraries';
import type { usePanelLayout } from './usePanelLayout';
import type { usePreferences } from './usePreferences';
import type { PrintersState } from './usePrinters';
import type { SceneLibrary } from './useSceneLibrary';
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
  sceneLibrary: SceneLibrary;
}

function useSharedPreferences(prefs: StudioSources['prefs']) {
  const { snapStepMm, setSnapStepMm, snapAngleDeg, trackpadMode, setTrackpadMode, showGrid, setShowGrid } = prefs;
  const { sculptEnabled, autoGuide, autoFixBlockers, measureUnit, showReferenceImages, setShowReferenceImages } = prefs;

  return useMemo(
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
      autoGuide,
      autoFixBlockers,
      showReferenceImages,
      setShowReferenceImages,
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
      autoGuide,
      autoFixBlockers,
      showReferenceImages,
      setShowReferenceImages,
    ],
  );
}

export function useStudio(sources: StudioSources) {
  const { prefs, layout, libraries, agent, settings, core, actions, tabList, openSceneList, printers } = sources;
  const { openSceneFile, importSceneFile } = sources.sceneLibrary;
  const preferences = useSharedPreferences(prefs);
  const { isLeftOpen, setIsLeftOpen, isRightOpen, setIsRightOpen, panelWidths, setPanelWidths } = layout;
  const { resizingPanel, setResizingPanel, setRightIslandWidth } = layout;
  const { customModels, setCustomModels, uploadedImages, setUploadedImages, chatList, setChatList } = libraries;
  const { acpStatus, reconnectAcp, signInAcp, saveAgentApiKey, agentChoice, setAgentChoice } = agent;
  const { register, reportMeta, newScene, selectTab, robotsBeside, handleOf } = core;
  const { renameTab, closeTab, duplicateTab, reopenTab, cycleTab, focusChat, notify } = actions;
  const canReopenTab = core.closed.length > 0;

  return useMemo<StudioShared>(
    () => ({
      ...preferences,
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
      agentChoice,
      setAgentChoice,
      settingsOpen: settings.settingsOpen,
      openSettings: settings.openSettings,
      printers,
      tabs: tabList,
      robotsBeside,
      handleOf,
      canReopenTab,
      register,
      reportMeta,
      reportRightIsland: setRightIslandWidth,
      newScene,
      openSceneList,
      openSceneFile,
      importSceneFile,
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
      preferences,
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
      agentChoice,
      setAgentChoice,
      settings.settingsOpen,
      settings.openSettings,
      printers,
      tabList,
      robotsBeside,
      handleOf,
      canReopenTab,
      register,
      reportMeta,
      setRightIslandWidth,
      newScene,
      openSceneList,
      openSceneFile,
      importSceneFile,
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
