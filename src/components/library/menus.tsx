import type { ContextMenuEntry } from '../../design-system';
import { PlusIcon, deleteEntry, duplicateEntry, renameEntry } from '../../design-system';
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
    renameEntry(o.onRename),
    duplicateEntry(o.onDuplicate),
    { divider: true },
    deleteEntry(o.onDelete),
  ];
}
