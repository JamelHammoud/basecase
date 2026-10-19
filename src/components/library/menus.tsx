import { Copy, Pencil, Plus, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { ContextMenuEntry } from '../../design-system';
import type { CustomModelDefinition, SavedSceneSummary } from '../../types/robotics';

const icon = 'w-3.5 h-3.5';

interface SceneMenuOptions {
  scene: SavedSceneSummary;
  isCurrent: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function sceneMenu(o: SceneMenuOptions): ContextMenuEntry[] {
  const open: ContextMenuEntry[] = o.isCurrent
    ? []
    : [{ label: o.isOpen ? 'Show Tab' : 'Open', icon: <SquareArrowOutUpRight className={icon} />, onSelect: o.onOpen }];

  return [
    ...open,
    { label: 'Rename', icon: <Pencil className={icon} />, onSelect: o.onRename },
    { label: 'Duplicate', icon: <Copy className={icon} />, onSelect: o.onDuplicate },
    { divider: true },
    { label: 'Delete', icon: <Trash2 className={icon} />, tone: 'danger', onSelect: o.onDelete },
  ];
}

interface ModelMenuOptions {
  model: CustomModelDefinition;
  onInsert: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function modelMenu(o: ModelMenuOptions): ContextMenuEntry[] {
  return [
    { label: 'Insert', icon: <Plus className={icon} />, onSelect: o.onInsert },
    { label: 'Rename', icon: <Pencil className={icon} />, onSelect: o.onRename },
    { label: 'Duplicate', icon: <Copy className={icon} />, onSelect: o.onDuplicate },
    { divider: true },
    { label: 'Delete', icon: <Trash2 className={icon} />, tone: 'danger', onSelect: o.onDelete },
  ];
}
