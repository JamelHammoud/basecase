import { useEffect, useEffectEvent } from 'react';
import { platformBridge } from '../utils/platformBridge';
import type { TabListItem } from './tabModel';
import { tabCommandForKey } from './tabShortcuts';

export interface TabCommands {
  activeId: string;
  newScene: () => void;
  closeTab: (id: string) => void;
  reopenTab: () => void;
  cycleTab: (step: number) => void;
  selectTab: (id: string) => void;
  toggleSceneList: () => void;
}

export interface AppMenuInput {
  commands: TabCommands;
  tabList: TabListItem[];
  canReopenTab: boolean;
  settingsOpen: boolean;
}

function runTabCommand(id: string, commands: TabCommands): boolean {
  if (id.startsWith('tab:')) {
    commands.selectTab(id.slice(4));

    return true;
  }

  const actions = new Map<string, () => void>([
    ['new-scene', () => commands.newScene()],
    ['close-tab', () => commands.closeTab(commands.activeId)],
    ['reopen-tab', () => commands.reopenTab()],
    ['next-tab', () => commands.cycleTab(1)],
    ['prev-tab', () => commands.cycleTab(-1)],
    ['open-scenes', () => commands.toggleSceneList()],
  ]);
  const run = actions.get(id);

  run?.();

  return !!run;
}

export function useAppMenu({ commands, tabList, canReopenTab, settingsOpen }: AppMenuInput) {
  const onMenuCommand = useEffectEvent((id: string) => void runTabCommand(id, commands));

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (settingsOpen) return;

    const command = tabCommandForKey(
      e,
      tabList.map((t) => t.id),
    );

    if (!command) return;

    e.preventDefault();
    runTabCommand(command, commands);
  });

  useEffect(() => platformBridge.onMenuCommand((id) => onMenuCommand(id)), []);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);

    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    platformBridge.setMenuState({ tabs: tabList, activeTab: commands.activeId, canReopenTab });
  }, [tabList, commands.activeId, canReopenTab]);
}
