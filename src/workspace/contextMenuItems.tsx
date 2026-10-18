import {
  AlignCenterVertical,
  ArrowDownToLine,
  BookmarkPlus,
  Box,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Group,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageCircle,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  SquareDashedMousePointer,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react';
import { AlignControls } from '../components/AlignControls';
import { CAMERA_VIEWS } from '../data/cameraViews';
import type { ContextMenuEntry } from '../design-system';
import type { PartRole, ScenePart } from '../types/robotics';
import type { CanvasMenuState } from './useCanvasMenu';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

export interface ContextInputs {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
}

const ic = 'w-3.5 h-3.5';

const ROLE_ENTRIES: Array<{ label: string; role: PartRole }> = [
  { label: 'Solid', role: 'solid' },
  { label: 'Cutout', role: 'cutout' },
  { label: 'Guide', role: 'reference' },
];

function sharedEntries({ core, actions }: ContextInputs) {
  const { ops, edits, library } = actions;

  return {
    align: {
      label: 'Align',
      icon: <AlignCenterVertical className={ic} />,
      submenu: (close: () => void) => (
        <AlignControls
          count={Math.max(1, core.selectedIds.length)}
          onAlign={edits.align}
          onDistribute={edits.distribute}
          onDone={close}
        />
      ),
    } satisfies ContextMenuEntry,
    drop: {
      label: 'Drop to Floor',
      shortcut: 'F',
      icon: <ArrowDownToLine className={ic} />,
      onSelect: edits.dropToGround,
    } satisfies ContextMenuEntry,
    duplicate: {
      label: 'Duplicate',
      shortcut: '⌘D',
      icon: <Copy className={ic} />,
      onSelect: ops.duplicateSelected,
    } satisfies ContextMenuEntry,
    selectAll: {
      label: 'Select All',
      shortcut: '⌘A',
      icon: <SquareDashedMousePointer className={ic} />,
      disabled: core.parts.length === 0,
      onSelect: core.selection.selectAll,
    } satisfies ContextMenuEntry,
    saveToLibrary: {
      label: 'Save to Library',
      icon: <BookmarkPlus className={ic} />,
      onSelect: () => void library.saveAsModel('selected'),
    } satisfies ContextMenuEntry,
    remove: {
      label: 'Delete',
      shortcut: '⌫',
      icon: <Trash2 className={ic} />,
      tone: 'danger',
      onSelect: ops.deleteSelected,
    } satisfies ContextMenuEntry,
  };
}

function multiItems(inputs: ContextInputs): ContextMenuEntry[] {
  const { core, actions } = inputs;
  const { ops, edits } = actions;
  const { selectedParts } = core.selection;
  const shared = sharedEntries(inputs);
  const roles = new Set(selectedParts.map((p) => p.role));

  return [
    { heading: `${core.selectedIds.length} parts` },
    { label: 'Union', icon: <SquaresUnite className={ic} />, onSelect: () => ops.runBoolean('union') },
    {
      label: `Subtract from ${selectedParts[0]?.name ?? 'First'}`,
      icon: <SquaresSubtract className={ic} />,
      onSelect: () => ops.runBoolean('subtract'),
    },
    { label: 'Intersect', icon: <SquaresIntersect className={ic} />, onSelect: () => ops.runBoolean('intersect') },
    { divider: true },
    shared.align,
    shared.drop,
    { divider: true },
    ...ROLE_ENTRIES.map(({ label, role }) => ({
      label,
      checked: roles.size === 1 && roles.has(role),
      onSelect: () => edits.setSelectedRoles(role),
    })),
    { divider: true },
    ...(selectedParts.some((p) => p.hardware)
      ? [{ label: 'Add Clearance Holes', icon: <SquaresSubtract className={ic} />, onSelect: ops.addClearanceHole }]
      : []),
    { label: 'Group', shortcut: '⌘G', icon: <Group className={ic} />, onSelect: edits.group },
    ...(selectedParts.some((p) => p.group)
      ? [{ label: 'Ungroup', shortcut: '⇧⌘G', icon: <Ungroup className={ic} />, onSelect: edits.ungroup }]
      : []),
    shared.duplicate,
    shared.selectAll,
    shared.saveToLibrary,
    { divider: true },
    shared.remove,
  ];
}

function partFlagItems(part: ScenePart, setFlag: (patch: Partial<ScenePart>) => void): ContextMenuEntry[] {
  return [
    {
      label: part.locked ? 'Unlock' : 'Lock',
      icon: part.locked ? <Unlock className={ic} /> : <Lock className={ic} />,
      onSelect: () => setFlag({ locked: !part.locked }),
    },
    {
      label: part.visible ? 'Hide' : 'Show',
      icon: part.visible ? <EyeOff className={ic} /> : <Eye className={ic} />,
      onSelect: () => setFlag({ visible: !part.visible }),
    },
  ];
}

function partItems(inputs: ContextInputs, part: ScenePart, commentHere: ContextMenuEntry[]): ContextMenuEntry[] {
  const { actions, ui } = inputs;
  const { ops, edits } = actions;
  const shared = sharedEntries(inputs);
  const setFlag = (patch: Partial<ScenePart>) => edits.patchPart(part.id, patch);

  return [
    { heading: part.name },
    ...(part.hardware
      ? [{ label: 'Add Clearance Hole', icon: <SquaresSubtract className={ic} />, onSelect: ops.addClearanceHole }]
      : []),
    shared.duplicate,
    shared.selectAll,
    shared.saveToLibrary,
    ...commentHere,
    { divider: true },
    shared.align,
    shared.drop,
    { label: 'Stack on Part Below', shortcut: 'S', icon: <Layers className={ic} />, onSelect: edits.stackOnBelow },
    {
      label: 'Reset Rotation',
      icon: <RotateCcw className={ic} />,
      disabled: part.rotation.every((r) => r === 0),
      onSelect: () => setFlag({ rotation: [0, 0, 0] }),
    },
    { label: 'Zoom to Part', shortcut: 'Z', icon: <Crosshair className={ic} />, onSelect: ui.focusSelected },
    { divider: true },
    ...ROLE_ENTRIES.map(({ label, role }) => ({
      label,
      checked: part.role === role,
      onSelect: () => setFlag({ role }),
    })),
    { divider: true },
    {
      label: 'Subtract Overlapping Cutouts',
      icon: <SquaresSubtract className={ic} />,
      onSelect: () => ops.runBoolean('subtract'),
    },
    ...(part.group
      ? [
          {
            label: `Ungroup ${part.group.name}`,
            shortcut: '⇧⌘G',
            icon: <Ungroup className={ic} />,
            onSelect: edits.ungroup,
          },
        ]
      : []),
    { divider: true },
    ...partFlagItems(part, setFlag),
    shared.remove,
  ];
}

function canvasItems(inputs: ContextInputs, menu: CanvasMenuState, commentHere: ContextMenuEntry[]) {
  const { core, actions, ui } = inputs;
  const { tool, studio } = core;
  const shared = sharedEntries(inputs);
  const items: ContextMenuEntry[] = [
    { label: 'Add Part…', shortcut: '⌘K', icon: <Plus className={ic} />, onSelect: () => ui.setPaletteOpen(true) },
    ...commentHere,
    {
      label: 'Add Reference Image…',
      icon: <ImageIcon className={ic} />,
      onSelect: () => actions.creation.pickReferenceImage(menu.point),
    },
    { label: 'Sketch…', icon: <PenTool className={ic} />, onSelect: () => tool.openCreator('draw2d') },
    { label: 'Import SVG…', icon: <FileUp className={ic} />, onSelect: () => tool.openCreator('svg') },
    { divider: true },
    shared.selectAll,
    { divider: true },
    ...CAMERA_VIEWS.map((v) => ({
      label: `${v.label} View`,
      shortcut: v.shortcut,
      icon: <Box className={ic} />,
      onSelect: () => ui.setCameraView(v.id),
    })),
    { label: 'Reset View', icon: <Crosshair className={ic} />, onSelect: ui.resetView },
    { divider: true },
    { label: 'Show Grid', checked: studio.showGrid, onSelect: ui.toggleGrid },
    { divider: true },
    { label: 'Save Scene', shortcut: '⌘S', icon: <Save className={ic} />, onSelect: () => void actions.library.sync() },
    {
      label: 'Export STL',
      icon: <Download className={ic} />,
      disabled: core.parts.length === 0,
      onSelect: actions.exports.exportStl,
    },
  ];

  return items;
}

export function contextMenuItems(menu: CanvasMenuState, inputs: ContextInputs): ContextMenuEntry[] {
  const { core } = inputs;
  const point = menu.point;
  const commentHere: ContextMenuEntry[] = point
    ? [
        {
          label: 'Comment Here',
          shortcut: 'M',
          icon: <MessageCircle className={ic} />,
          onSelect: () => core.annotations.place(point, menu.partId),
        },
      ]
    : [];
  const part = core.parts.find((p) => p.id === menu.partId);

  if (part && core.selectedIds.length > 1 && core.selectedIds.includes(part.id)) return multiItems(inputs);

  if (part) return partItems(inputs, part, commentHere);

  return canvasItems(inputs, menu, commentHere);
}
