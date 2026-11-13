import type { ContextMenuEntry } from './ContextMenu';
import { DuplicateIcon } from './glyphs';
import { DeleteIcon, EditIcon } from './toolIcons';

const icon = 'w-3.5 h-3.5';

export const renameEntry = (onSelect: () => void): ContextMenuEntry => ({
  label: 'Rename',
  icon: <EditIcon className={icon} />,
  onSelect,
});

export const duplicateEntry = (onSelect: () => void): ContextMenuEntry => ({
  label: 'Duplicate',
  icon: <DuplicateIcon className={icon} />,
  onSelect,
});

export const deleteEntry = (onSelect: () => void, shortcut?: string): ContextMenuEntry => ({
  label: 'Delete',
  icon: <DeleteIcon className={icon} />,
  tone: 'danger',
  shortcut,
  onSelect,
});
