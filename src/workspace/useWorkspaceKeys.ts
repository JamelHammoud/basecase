import { useEffect, useEffectEvent } from 'react';
import { shortcutFor, type ShortcutHandlers, type ShortcutId } from '../app/shortcuts';
import { toggleCameraViews } from '../cameras/cameraViewsStore';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { isModalOpen } from '../design-system';
import { endServoSetup, servoSetup } from '../robot/servoSetup';
import { isTextEntry } from './helpers';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

interface KeyOptions {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
}

export type WorkspaceKeyDeps = Omit<KeyOptions, 'active'>;

const ANYWHERE = new Set<ShortcutId>(['palette', 'settings']);
const WHILE_RUNNING = new Set<ShortcutId>(['undo', 'redo', 'toggle-inspector']);
const SHIFTED = new Set<ShortcutId>(['toggle-reference-images', 'toggle-camera-views', 'shortcuts']);

const isFormFocus = (el: Element | null) => isTextEntry(el) || el instanceof HTMLSelectElement;

const keysGoElsewhere = () => isFormFocus(document.activeElement) || isModalOpen();

function editKeys({ core, actions, ui }: WorkspaceKeyDeps): ShortcutHandlers {
  const { tool, undo, redo, selection } = core;
  const { edits, ops } = actions;
  const { marks } = core;

  const deleteSelected = () => {
    if (tool.marking && marks.selected) marks.remove(marks.selected.id);
    else ops.deleteSelected();
  };

  return {
    undo: () => {
      ui.markKeyEdit();
      undo();
    },
    redo: () => {
      ui.markKeyEdit();
      redo();
    },
    'select-all': () => {
      ui.markKeyEdit();
      selection.selectAll();
    },
    group: edits.group,
    ungroup: edits.ungroup,
    duplicate: ops.duplicateSelected,
    delete: deleteSelected,
    'drop-to-floor': edits.dropToGround,
    stack: edits.stackOnBelow,
  };
}

function toolKeys({ core, actions, ui }: WorkspaceKeyDeps): ShortcutHandlers {
  const { tool, annotations, studio, marks } = core;

  return {
    move: () => tool.setMode('translate'),
    rotate: () => tool.setMode('rotate'),
    scale: () => tool.setMode('scale'),
    sculpt: () => {
      if (studio.sculptEnabled) tool.setMode('sculpt');
    },
    'show-pose': () => actions.pose.openPose(),
    comment: () => annotations.toggleCommentMode(),
    measure: () => tool.toggleMeasure(),
    annotate: () => tool.toggleMarking(),
    marker: () => marks.setTool('marker'),
    eraser: () => marks.setTool('eraser'),
    shapes: ui.toggleShapes,
  };
}

function appKeys({ core, ui }: WorkspaceKeyDeps): ShortcutHandlers {
  const { tool, studio } = core;

  const runRoutine = () => {
    const { routines } = core.simTraining;

    if (tool.leftTab === 'routines' && studio.isLeftOpen && routines.view.compiled?.ok) void routines.run();
  };

  return {
    palette: ui.togglePalette,
    settings: () => studio.openSettings(),
    shortcuts: () => studio.openSettings('shortcuts'),
    'find-parts': ui.findParts,
    'toggle-sidebar': ui.toggleLeft,
    'toggle-inspector': ui.toggleRight,
    'toggle-reference-images': ui.toggleReferenceImages,
    'toggle-camera-views': toggleCameraViews,
    print: () => (core.printing.mode ? core.printing.closeMode() : core.printing.openMode(1)),
    'run-routine': runRoutine,
  };
}

function viewKeys({ core, actions, ui }: WorkspaceKeyDeps): ShortcutHandlers {
  const { tool, annotations, setSelectedIds, viewportRef, marks } = core;
  const { joints } = actions;

  const leaveMeasure = () => {
    if (!viewportRef.current?.cancelMeasure()) tool.toggleMeasure(false);
  };

  const leaveStudio = () => {
    if (!tool.studioUnsaved) tool.leaveStudio();
  };

  const deselect = () => {
    if (servoSetup()) endServoSetup();
    else if (annotations.draft) annotations.setDraft(null);
    else if (annotations.activeId) annotations.setActiveId(null);
    else if (annotations.commentMode) annotations.toggleCommentMode(false);
    else if (tool.measuring) leaveMeasure();
    else if (tool.marking && marks.selected) marks.select(null);
    else if (tool.marking) tool.toggleMarking(false);
    else if (joints.picking) joints.cancel();
    else if (tool.studioMode) leaveStudio();
    else setSelectedIds([]);
  };

  return {
    'zoom-selection': ui.focusSelected,
    deselect,
    ...Object.fromEntries(CAMERA_VIEWS.map((v) => [`view:${v.id}`, () => ui.setCameraView(v.id)])),
  };
}

export const workspaceKeyHandlers = (deps: WorkspaceKeyDeps): ShortcutHandlers => ({
  ...editKeys(deps),
  ...toolKeys(deps),
  ...appKeys(deps),
  ...viewKeys(deps),
});

export function useWorkspaceKeys({ active, core, actions, ui }: KeyOptions) {
  const blocked = ui.paletteOpen || core.studio.settingsOpen;

  const commandFor = (e: KeyboardEvent) =>
    (core.tool.marking && shortcutFor(e, 'annotate')) || shortcutFor(e, 'canvas');

  const runsAnywhere = (id: ShortcutId | null) =>
    !!id && (ANYWHERE.has(id) || (id === 'find-parts' && !blocked && !core.caseRun.open));

  const keysOff = () => keysGoElsewhere() || blocked;
  const busy = () => core.simTraining.sim.drive.active || core.buildAlong.active;
  const runsWhileRunning = (id: ShortcutId | null) => !!id && core.caseRun.open && WHILE_RUNNING.has(id);

  const onRunningKey = (e: KeyboardEvent, id: ShortcutId | null) => {
    if (id !== 'deselect') return;

    e.preventDefault();
    core.caseRun.leave();
  };

  const heldBack = (e: KeyboardEvent, id: ShortcutId | null) => {
    if (runsAnywhere(id)) return false;

    if (keysOff()) return true;

    if (runsWhileRunning(id)) return false;

    if (busy()) return true;

    if (core.caseRun.open) onRunningKey(e, id);

    return core.caseRun.open;
  };

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const id = commandFor(e);
    const mod = e.metaKey || e.ctrlKey;

    if (heldBack(e, id)) return;

    if (!id || (!mod && core.printing.mode)) return;

    if (mod || SHIFTED.has(id)) e.preventDefault();

    workspaceKeyHandlers({ core, actions, ui })[id]?.(e);
  });

  useEffect(() => {
    if (!active) return;

    const listener = (e: KeyboardEvent) => onKeyDown(e);

    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, [active]);
}
