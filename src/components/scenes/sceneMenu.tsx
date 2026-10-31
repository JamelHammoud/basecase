import type { ContextMenuEntry } from '../../design-system';
import { CopyIcon, DeleteIcon, EditIcon, ExternalLinkIcon } from '../../design-system';

const icon = 'w-3.5 h-3.5';

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
    : [{ label: 'Open', icon: <ExternalLinkIcon className={icon} />, onSelect: o.onOpen }];

  return [
    ...open,
    { label: 'Rename', icon: <EditIcon className={icon} />, onSelect: o.onRename },
    { label: 'Duplicate', icon: <CopyIcon className={icon} />, onSelect: o.onDuplicate },
    { divider: true },
    { label: 'Delete', icon: <DeleteIcon className={icon} />, tone: 'danger', onSelect: o.onDelete },
  ];
}
