import { cameraViewsToggleLabel, toggleCameraViews } from '../cameras/cameraViewsStore';
import { AlignBar } from '../components/AlignBar';
import {
  CameraAddIcon,
  CameraIcon,
  AlignCenterXIcon,
  CommentIcon,
  DeleteIcon,
  DownloadIcon,
  FileImportIcon,
  MarkerIcon,
  PenIcon,
  PhotoIcon,
  PlusIcon,
  RefreshIcon,
  RulerIcon,
  ShapeIcon,
  SubtractIcon,
  UngroupIcon,
} from '../design-system';
import { faultSubmenu } from '../components/simulate/faultMenu';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { partTarget, selectedTarget, type OnshapeTarget } from '../onshape/onshapeTarget';
import type { ContextMenuEntry } from '../design-system';
import type { PartRole, ScenePart } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CanvasMenuState } from './useCanvasMenu';
import { handJointMenuItems } from './jointCommands';
import { leaderMenuItems } from './leaderCommands';
import { mirrorMenuEntry } from './mirrorCommands';
import { isRotated, menuEntry, onePartActions, selectionActions } from './partActions';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';
import { sceneHasCameraViews } from './viewCommands';
import { plural } from '../../electron/plural.mjs';

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

function sharedEntries(inputs: ContextInputs) {
  const { core, actions } = inputs;
  const { edits } = actions;
  const act = selectionActions(inputs);

  return {
    align: {
      label: 'Align',
      icon: <AlignCenterXIcon className={ic} />,
      submenu: (close: () => void) => (
        <AlignBar
          count={Math.max(1, core.selectedIds.length)}
          onAlign={edits.align}
          onDistribute={edits.distribute}
          onDone={close}
        />
      ),
    } satisfies ContextMenuEntry,
    drop: menuEntry(act.floor),
    duplicate: menuEntry(act.duplicate),
    mirror: mirrorMenuEntry(actions.mirror),
    selectAll: menuEntry(act.selectAll, { disabled: core.parts.length === 0 }),
    saveToLibrary: menuEntry(act.saveToLibrary),
    remove: menuEntry(act.remove),
  };
}

function wrapItems(inputs: ContextInputs): ContextMenuEntry[] {
  if (!inputs.actions.wrap.canWrap()) return [];

  return [menuEntry(selectionActions(inputs).wrap), { divider: true }];
}

function onshapeItems({ actions }: ContextInputs, target: OnshapeTarget | null): ContextMenuEntry[] {
  if (IS_WEB_DEMO || !target) return [];

  return [
    {
      label: 'Update from Onshape',
      icon: <RefreshIcon className={ic} />,
      onSelect: () => void actions.onshape.update(target.group.id),
    },
  ];
}

function multiItems(inputs: ContextInputs): ContextMenuEntry[] {
  const { core, actions } = inputs;
  const { ops, edits } = actions;
  const { selectedParts } = core.selection;
  const shared = sharedEntries(inputs);
  const act = selectionActions(inputs);
  const roles = new Set(selectedParts.map((p) => p.role));

  return [
    { heading: plural(core.selectedIds.length, 'part') },
    ...wrapItems(inputs),
    menuEntry(act.union),
    {
      label: `Subtract from ${selectedParts[0]?.name ?? 'First'}`,
      icon: <SubtractIcon className={ic} />,
      onSelect: () => ops.runBoolean('subtract'),
    },
    menuEntry(act.intersect),
    { divider: true },
    ...handJointMenuItems(actions.joints),
    shared.align,
    shared.drop,
    { divider: true },
    ...ROLE_ENTRIES.map(({ label, role }) => ({
      label,
      checked: roles.size === 1 && roles.has(role),
      onSelect: () => edits.setSelectedRoles(role),
    })),
    { divider: true },
    ...(selectedParts.some((p) => p.hardware) ? [menuEntry(act.clearanceHole)] : []),
    menuEntry(act.group),
    ...(selectedParts.some((p) => p.group) ? [menuEntry(act.ungroup)] : []),
    ...onshapeItems(inputs, selectedTarget(core.parts, core.selectedIds)),
    shared.duplicate,
    shared.mirror,
    shared.selectAll,
    shared.saveToLibrary,
    { divider: true },
    shared.remove,
  ];
}

function copyPartName({ core }: ContextInputs, name: string) {
  void navigator.clipboard.writeText(name).then(() => core.showToast(`Copied ${name}`));
}

function faultItems({ core }: ContextInputs, part: ScenePart): ContextMenuEntry[] {
  const { sim } = core.simTraining;
  const jointId = core.posing.rig.ownerOf.get(part.id);
  const driven = sim.model?.joints.some((j) => j.id === jointId && j.actuator >= 0);

  if (sim.status === 'off' || !jointId || !driven) return [];

  const current = sim.stats?.joints.find((j) => j.id === jointId)?.fault;

  return [faultSubmenu(current, (kind) => sim.setFault(jointId, kind)), { divider: true }];
}

function partItems(inputs: ContextInputs, part: ScenePart, commentHere: ContextMenuEntry[]): ContextMenuEntry[] {
  const { actions } = inputs;
  const { ops, edits } = actions;
  const shared = sharedEntries(inputs);
  const act = selectionActions(inputs);
  const one = onePartActions(inputs, part);

  return [
    { heading: part.name, onSelect: () => copyPartName(inputs, part.name) },
    ...faultItems(inputs, part),
    ...(part.hardware ? [menuEntry(act.clearanceHole)] : []),
    shared.duplicate,
    shared.mirror,
    shared.selectAll,
    shared.saveToLibrary,
    ...(one.quote ? [menuEntry(one.quote)] : []),
    ...leaderMenuItems(actions, part.id),
    ...commentHere,
    { divider: true },
    shared.align,
    shared.drop,
    menuEntry(act.stack),
    menuEntry(one.resetRotation, { disabled: !isRotated(part) }),
    menuEntry(act.zoom),
    { divider: true },
    ...ROLE_ENTRIES.map(({ label, role }) => ({
      label,
      checked: part.role === role,
      onSelect: () => edits.patchPart(part.id, { role }),
    })),
    { divider: true },
    {
      label: 'Subtract Overlapping Cutouts',
      icon: <SubtractIcon className={ic} />,
      onSelect: () => ops.runBoolean('subtract'),
    },
    ...(part.group
      ? [
          {
            label: `Ungroup ${part.group.name}`,
            shortcut: '⇧⌘G',
            icon: <UngroupIcon className={ic} />,
            onSelect: edits.ungroup,
          },
        ]
      : []),
    ...onshapeItems(inputs, partTarget(inputs.core.parts, part)),
    { divider: true },
    menuEntry(one.lock),
    menuEntry(one.hide),
    shared.remove,
  ];
}

function canvasItems(inputs: ContextInputs, menu: CanvasMenuState, commentHere: ContextMenuEntry[]) {
  const { core, actions, ui } = inputs;
  const { tool, studio } = core;
  const shared = sharedEntries(inputs);
  const items: ContextMenuEntry[] = [
    { label: 'Add Part', shortcut: '⌘K', icon: <PlusIcon className={ic} />, onSelect: () => ui.setPaletteOpen(true) },
    ...commentHere,
    {
      label: 'Add Reference Image',
      icon: <PhotoIcon className={ic} />,
      onSelect: () => actions.creation.pickReferenceImage(menu.point),
    },
    { label: 'Sketch', icon: <PenIcon className={ic} />, onSelect: core.sketching.open },
    {
      label: 'Annotate',
      shortcut: 'N',
      icon: <MarkerIcon className={ic} />,
      onSelect: () => tool.toggleMarking(true),
    },
    ...(core.marks.marks.length
      ? [{ label: 'Delete Marks', icon: <DeleteIcon className={ic} />, onSelect: core.marks.deleteAll }]
      : []),
    {
      label: 'Import',
      icon: <FileImportIcon className={ic} />,
      onSelect: () => void actions.files.pickImports(menu.point),
    },
    { divider: true },
    shared.selectAll,
    { divider: true },
    ...CAMERA_VIEWS.map((v) => ({
      label: `${v.label} View`,
      shortcut: v.shortcut,
      icon: <ShapeIcon className={ic} />,
      onSelect: () => ui.setCameraView(v.id),
    })),
    menuEntry(selectionActions(inputs).resetView),
    { label: 'Add Camera View', icon: <CameraAddIcon className={ic} />, onSelect: actions.cameras.add },
    ...(sceneHasCameraViews(inputs)
      ? [
          {
            label: cameraViewsToggleLabel(),
            shortcut: '⇧V',
            icon: <CameraIcon className={ic} />,
            onSelect: toggleCameraViews,
          },
        ]
      : []),
    { divider: true },
    { label: 'Show Grid', checked: studio.showGrid, onSelect: ui.toggleGrid },
    { divider: true },
    {
      label: 'Export STL',
      icon: <DownloadIcon className={ic} />,
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
          icon: <CommentIcon className={ic} />,
          onSelect: () => core.annotations.place(point, menu.partId),
        },
        {
          label: 'Measure from Here',
          shortcut: 'D',
          icon: <RulerIcon className={ic} />,
          onSelect: () => {
            core.viewportRef.current?.measureFrom(menu.x, menu.y);
            core.tool.toggleMeasure(true);
            core.measure.setKind('ruler');
          },
        },
      ]
    : [];
  const part = core.parts.find((p) => p.id === menu.partId);

  if (part && core.selectedIds.length > 1 && core.selectedIds.includes(part.id)) return multiItems(inputs);

  if (part) return partItems(inputs, part, commentHere);

  return canvasItems(inputs, menu, commentHere);
}
