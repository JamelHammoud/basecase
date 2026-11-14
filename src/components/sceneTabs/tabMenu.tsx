import { ContextMenuEntry, CloseIcon, HistoryIcon, PlusIcon, duplicateEntry, renameEntry } from '../../design-system';
import { keyFor } from '../../app/shortcuts';

export interface TabMenuActions {
  tabIds: string[];
  activeId: string;
  canReopen: boolean;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
  onReopen: () => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseRight: (id: string) => void;
}

export function tabMenuItems(id: string, a: TabMenuActions): ContextMenuEntry[] {
  const index = a.tabIds.indexOf(id);

  return [
    renameEntry(() => a.onRename(id)),
    duplicateEntry(() => a.onDuplicate(id)),
    { divider: true },
    { label: 'New Scene', shortcut: keyFor('new-scene'), icon: <PlusIcon />, onSelect: a.onNew },
    {
      label: 'Reopen Closed Scene',
      shortcut: keyFor('reopen-tab'),
      icon: <HistoryIcon />,
      disabled: !a.canReopen,
      onSelect: a.onReopen,
    },
    { divider: true },
    {
      label: 'Close',
      shortcut: id === a.activeId ? keyFor('close-tab') : undefined,
      icon: <CloseIcon />,
      onSelect: () => a.onClose(id),
    },
    { label: 'Close Other Scenes', disabled: a.tabIds.length < 2, onSelect: () => a.onCloseOthers(id) },
    { label: 'Close Scenes to the Right', disabled: index === a.tabIds.length - 1, onSelect: () => a.onCloseRight(id) },
  ];
}
