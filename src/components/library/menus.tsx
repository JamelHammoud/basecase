import type { ContextMenuEntry } from '../../design-system';
import { CopyIcon, DeleteIcon, EditIcon, PlusIcon } from '../../design-system';
import type { CustomModelDefinition } from '../../types/robotics';

const icon = 'w-3.5 h-3.5';

interface ModelMenuOptions {
  model: CustomModelDefinition;
  onInsert: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function modelMenu(o: ModelMenuOptions): ContextMenuEntry[] {
  return [
    { label: 'Insert', icon: <PlusIcon className={icon} />, onSelect: o.onInsert },
    { label: 'Rename', icon: <EditIcon className={icon} />, onSelect: o.onRename },
    { label: 'Duplicate', icon: <CopyIcon className={icon} />, onSelect: o.onDuplicate },
    { divider: true },
    { label: 'Delete', icon: <DeleteIcon className={icon} />, tone: 'danger', onSelect: o.onDelete },
  ];
}
