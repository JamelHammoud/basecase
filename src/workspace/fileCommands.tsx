import type { Command } from '../components/CommandPalette';
import { CloseIcon, DuplicateIcon, EditIcon, FolderOpenIcon, HistoryIcon, PlusIcon, SwapIcon } from '../design-system';
import { keyFor } from '../app/shortcuts';
import { tabChord } from '../../electron/shortcutKeys.mjs';
import type { CommandInputs } from './sceneCommands';

export function fileCommands({ core }: CommandInputs): Command[] {
  const { studio, workspaceId } = core;
  const reopen: Command[] = studio.canReopenTab
    ? [
        {
          id: 'reopen-scene',
          group: 'Scene',
          label: 'Reopen Closed Scene',
          shortcut: keyFor('reopen-tab'),
          icon: <HistoryIcon />,
          keywords: 'tab undo restore',
          run: studio.reopenTab,
        },
      ]
    : [];

  return [
    {
      id: 'open-scenes',
      group: 'Scene',
      label: 'Show Scenes',
      shortcut: keyFor('open-scenes'),
      icon: <FolderOpenIcon />,
      keywords: 'open saved files browse recent history delete rename',
      run: studio.openSceneList,
    },
    {
      id: 'new',
      group: 'Scene',
      label: 'New Scene',
      shortcut: keyFor('new-scene'),
      icon: <PlusIcon />,
      keywords: 'tab open',
      run: () => studio.newScene(),
    },
    {
      id: 'rename-scene',
      group: 'Scene',
      label: 'Rename Scene',
      icon: <EditIcon />,
      keywords: 'tab name title',
      run: () => studio.startRenameTab(workspaceId),
    },
    {
      id: 'duplicate-scene',
      group: 'Scene',
      label: 'Duplicate Scene',
      icon: <DuplicateIcon />,
      keywords: 'tab copy',
      run: () => studio.duplicateTab(workspaceId),
    },
    {
      id: 'close-scene',
      group: 'Scene',
      label: 'Close Scene',
      shortcut: keyFor('close-tab'),
      icon: <CloseIcon />,
      keywords: 'tab',
      run: () => studio.closeTab(workspaceId),
    },
    ...reopen,
    ...studio.tabs
      .filter((t) => t.id !== workspaceId)
      .map((t) => ({
        id: `tab-${t.id}`,
        group: 'Open Scenes',
        label: t.name || 'Untitled',
        shortcut: tabChord(studio.tabs.indexOf(t), studio.tabs.length),
        icon: <SwapIcon />,
        keywords: 'tab switch go to',
        run: () => studio.selectTab(t.id),
      })),
  ];
}
