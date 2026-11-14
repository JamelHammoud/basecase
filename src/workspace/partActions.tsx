import type React from 'react';
import type { Command } from '../components/CommandPalette';
import {
  BookmarkAddIcon,
  BotIcon,
  CrosshairIcon,
  DeleteIcon,
  DuplicateIcon,
  EditIcon,
  FitIcon,
  FloorIcon,
  GroupIcon,
  HiddenIcon,
  IntersectIcon,
  JointsIcon,
  LayersIcon,
  LockIcon,
  LookIcon,
  RotateLeftIcon,
  SelectAllIcon,
  SparklesIcon,
  SubtractIcon,
  UngroupIcon,
  UnionIcon,
  UnlockIcon,
  type ContextMenuEntry,
} from '../design-system';
import { partQuote } from '../agent/partQuote';
import { renameTarget } from '../components/layers/layerRows';
import { keyFor } from '../app/shortcuts';
import type { ScenePart } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

export interface PartActionInputs {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
}

export interface PartAction {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  run: () => void;
  shortcut?: string;
  keywords?: string;
  danger?: boolean;
}

export const menuEntry = (action: PartAction, extra: { disabled?: boolean } = {}): ContextMenuEntry => ({
  label: action.label,
  shortcut: action.shortcut,
  icon: <action.icon className="w-3.5 h-3.5" />,
  ...(action.danger ? { tone: 'danger' as const } : {}),
  onSelect: action.run,
  ...extra,
});

export const paletteCommand = (action: PartAction, group: string): Command => ({
  id: action.id,
  group,
  label: action.label,
  shortcut: action.shortcut,
  keywords: action.keywords,
  icon: <action.icon className="w-4 h-4" />,
  run: action.run,
});

const clearanceHoles = (selected: ScenePart[]) => selected.filter((p) => p.hardware).length;

export function selectionActions({ core, actions, ui }: PartActionInputs) {
  const { ops, edits, library } = actions;

  return {
    selectAll: {
      id: 'select-all',
      label: 'Select All',
      shortcut: keyFor('select-all'),
      icon: SelectAllIcon,
      run: core.selection.selectAll,
    },
    duplicate: {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: keyFor('duplicate'),
      icon: DuplicateIcon,
      run: ops.duplicateSelected,
    },
    saveToLibrary: {
      id: 'save-to-library',
      label: 'Save to Library',
      icon: BookmarkAddIcon,
      keywords: 'model reuse keep',
      run: () => void library.saveAsModel('selected'),
    },
    remove: {
      id: 'delete',
      label: 'Delete',
      shortcut: keyFor('delete'),
      icon: DeleteIcon,
      keywords: 'remove',
      danger: true,
      run: ops.deleteSelected,
    },
    floor: {
      id: 'floor',
      label: 'Drop to Floor',
      shortcut: keyFor('drop-to-floor'),
      icon: FloorIcon,
      run: edits.dropToGround,
    },
    stack: {
      id: 'stack',
      label: 'Stack on Part Below',
      shortcut: keyFor('stack'),
      icon: LayersIcon,
      run: edits.stackOnBelow,
    },
    center: {
      id: 'center-on-origin',
      label: 'Center on Origin',
      icon: CrosshairIcon,
      keywords: 'origin zero middle position',
      run: edits.centerOnOrigin,
    },
    zoom: {
      id: 'zoom-selection',
      label: 'Zoom to Selection',
      shortcut: keyFor('zoom-selection'),
      icon: FitIcon,
      run: ui.focusSelected,
    },
    group: { id: 'group', label: 'Group', shortcut: keyFor('group'), icon: GroupIcon, run: edits.group },
    ungroup: { id: 'ungroup', label: 'Ungroup', shortcut: keyFor('ungroup'), icon: UngroupIcon, run: edits.ungroup },
    union: {
      id: 'union',
      label: 'Union',
      icon: UnionIcon,
      keywords: 'boolean merge combine',
      run: () => ops.runBoolean('union'),
    },
    intersect: {
      id: 'intersect',
      label: 'Intersect',
      icon: IntersectIcon,
      keywords: 'boolean common',
      run: () => ops.runBoolean('intersect'),
    },
    clearanceHole: {
      id: 'clearance-hole',
      label: clearanceHoles(core.selection.selectedParts) > 1 ? 'Add Clearance Holes' : 'Add Clearance Hole',
      icon: SubtractIcon,
      keywords: 'screw bolt hole cutout',
      run: ops.addClearanceHole,
    },
    wrap: {
      id: 'wrap-robot',
      label: 'Wrap Robot',
      icon: BotIcon,
      keywords: 'shell skin character mesh cover body printable',
      run: actions.wrap.wrapSelected,
    },
    sizeArm: {
      id: 'size-arm',
      label: 'Size Arm to Targets',
      icon: JointsIcon,
      keywords: 'reach payload link lengths servos manipulator design points reference',
      run: actions.arm.open,
    },
    resetView: { id: 'reset-view', label: 'Reset View', icon: RotateLeftIcon, run: ui.resetView },
  } satisfies Record<string, PartAction>;
}

export function onePartActions({ core, actions }: Omit<PartActionInputs, 'ui'>, part: ScenePart) {
  const setFlag = (patch: Partial<ScenePart>) => actions.edits.patchPart(part.id, patch);

  return {
    resetRotation: {
      id: 'reset-rotation',
      label: 'Reset Rotation',
      icon: RotateLeftIcon,
      run: () => setFlag({ rotation: [0, 0, 0] }),
    },
    lock: {
      id: 'toggle-lock',
      label: part.locked ? 'Unlock' : 'Lock',
      icon: part.locked ? UnlockIcon : LockIcon,
      run: () => setFlag({ locked: !part.locked }),
    },
    hide: {
      id: 'toggle-hide',
      label: part.visible ? 'Hide' : 'Show',
      icon: part.visible ? HiddenIcon : LookIcon,
      keywords: 'unhide visible part',
      run: () => setFlag({ visible: !part.visible }),
    },
    quote: IS_WEB_DEMO
      ? null
      : {
          id: 'quote-part',
          label: 'Quote Part',
          icon: SparklesIcon,
          keywords: 'agent ask chat',
          run: () => core.tool.requestQuote(partQuote(part)),
        },
  } satisfies Record<string, PartAction | null>;
}

export function renameAction({ core, ui }: Omit<PartActionInputs, 'actions'>): PartAction | null {
  const target = core.caseRun.open ? null : renameTarget(core.parts, core.selectedIds);

  return target ? { id: 'rename', label: 'Rename', icon: EditIcon, run: () => ui.renameLayer(target) } : null;
}

export const isRotated = (part: ScenePart) => part.rotation.some((r) => r !== 0);
