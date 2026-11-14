import type { ContextMenuEntry } from './ContextMenu';
import { DuplicateIcon } from './glyphs';
import { DeleteIcon, EditIcon, SearchIcon } from './toolIcons';

type MenuEntry = Extract<ContextMenuEntry, { label: string; onSelect: () => void }>;

export const renameEntry = (onSelect: () => void): MenuEntry => ({
  label: 'Rename',
  icon: <EditIcon />,
  onSelect,
});

export const duplicateEntry = (onSelect: () => void): MenuEntry => ({
  label: 'Duplicate',
  icon: <DuplicateIcon />,
  onSelect,
});

export const deleteEntry = (onSelect: () => void, shortcut?: string): MenuEntry => ({
  label: 'Delete',
  icon: <DeleteIcon />,
  tone: 'danger',
  shortcut,
  onSelect,
});

export const moreLikeThisEntry = (onSelect: () => void): MenuEntry => ({
  label: 'More Like This',
  icon: <SearchIcon />,
  onSelect,
});
