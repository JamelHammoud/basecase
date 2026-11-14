import type { ContextMenuEntry } from '../../design-system';
import { ExternalLinkIcon, deleteEntry, duplicateEntry, renameEntry } from '../../design-system';

interface SceneMenuOptions {
  isCurrent: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function sceneMenu(o: SceneMenuOptions): ContextMenuEntry[] {
  const open: ContextMenuEntry[] = o.isCurrent
    ? []
    : [{ label: 'Open', icon: <ExternalLinkIcon />, onSelect: o.onOpen }];

  return [...open, renameEntry(o.onRename), duplicateEntry(o.onDuplicate), { divider: true }, deleteEntry(o.onDelete)];
}
