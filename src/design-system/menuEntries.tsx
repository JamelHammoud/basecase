import type { ContextMenuEntry } from './ContextMenu';
import { DuplicateIcon } from './glyphs';
import { DeleteIcon, EditIcon } from './toolIcons';

type MenuEntry = Extract<ContextMenuEntry, { label: string; onSelect: () => void }>;

const icon = 'w-3.5 h-3.5';

export const renameEntry = (onSelect: () => void): MenuEntry => ({
  label: 'Rename',
  icon: <EditIcon className={icon} />,
  onSelect,
});

export const duplicateEntry = (onSelect: () => void): MenuEntry => ({
  label: 'Duplicate',
  icon: <DuplicateIcon className={icon} />,
  onSelect,
});

export const deleteEntry = (onSelect: () => void, shortcut?: string): MenuEntry => ({
  label: 'Delete',
  icon: <DeleteIcon className={icon} />,
  tone: 'danger',
  shortcut,
  onSelect,
});
