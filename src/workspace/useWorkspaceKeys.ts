import { useEffect, useEffectEvent } from 'react';
import { CAMERA_VIEWS } from '../data/cameraViews';
import { isModalOpen } from '../design-system';
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

type KeyMap = Record<string, (e: KeyboardEvent) => void>;

const isFormFocus = (el: Element | null) => isTextEntry(el) || el instanceof HTMLSelectElement;

const keysGoElsewhere = () => isFormFocus(document.activeElement) || isModalOpen();

const runKey = (map: KeyMap, key: string, e: KeyboardEvent, prevent: boolean) => {
  if (!Object.hasOwn(map, key)) return false;

  if (prevent) e.preventDefault();

  map[key](e);

  return true;
};

function useKeyMaps({ core, actions, ui }: Omit<KeyOptions, 'active'>) {
  'use memo';

  const { tool, annotations, studio, undo, redo, selection, setSelectedIds, viewportRef, marks } = core;
  const { edits, ops, pose } = actions;

  const leaveMeasure = () => {
    if (!viewportRef.current?.cancelMeasure()) tool.toggleMeasure(false);
  };

  const escape = () => {
    if (annotations.draft) annotations.setDraft(null);
    else if (annotations.activeId) annotations.setActiveId(null);
    else if (annotations.commentMode) annotations.toggleCommentMode(false);
    else if (tool.measuring) leaveMeasure();
    else if (tool.marking && marks.selected) marks.select(null);
    else if (tool.marking) tool.toggleMarking(false);
    else setSelectedIds([]);
  };

  const deleteSelected = () => {
    if (tool.marking && marks.selected) marks.remove(marks.selected.id);
    else ops.deleteSelected();
  };

  const global: KeyMap = {
    k: ui.togglePalette,
    ',': () => studio.openSettings(),
  };

  const withMod: KeyMap = {
    z: (e) => {
      ui.markKeyEdit();

      if (e.shiftKey) redo();
      else undo();
    },
    g: (e) => (e.shiftKey ? edits.ungroup() : edits.group()),
    a: () => {
      ui.markKeyEdit();
      selection.selectAll();
    },
    d: ops.duplicateSelected,
    b: ui.toggleLeft,
    i: ui.toggleRight,
  };

  const plain: KeyMap = {
    v: () => tool.setMode('translate'),
    w: () => tool.setMode('translate'),
    e: () => tool.setMode('rotate'),
    r: () => tool.setMode('scale'),
    c: () => {
      if (studio.sculptEnabled) tool.setMode('sculpt');
    },
    p: pose.openPose,
    f: edits.dropToGround,
    s: edits.stackOnBelow,
    z: ui.focusSelected,
    m: () => annotations.toggleCommentMode(),
    d: () => tool.toggleMeasure(),
    n: () => tool.toggleMarking(),
    a: ui.toggleShapes,
    escape,
    backspace: deleteSelected,
    delete: deleteSelected,
    ...Object.fromEntries(CAMERA_VIEWS.map((v, i) => [String(i + 1), () => ui.setCameraView(v.id)])),
  };

  return { global, withMod, plain };
}

export function useWorkspaceKeys({ active, core, actions, ui }: KeyOptions) {
  const maps = useKeyMaps({ core, actions, ui });
  const blocked = ui.paletteOpen || core.studio.settingsOpen;

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (mod && runKey(maps.global, key, e, true)) return;

    if (mod && !e.shiftKey && key === 'f' && !blocked) {
      e.preventDefault();
      ui.findParts();

      return;
    }

    if (keysGoElsewhere() || blocked) return;

    if (mod) {
      runKey(maps.withMod, key, e, true);

      return;
    }

    if (e.altKey) return;

    if (e.shiftKey && key === 'i') {
      e.preventDefault();
      ui.toggleReferenceImages();

      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      core.studio.openSettings('shortcuts');

      return;
    }

    runKey(maps.plain, key, e, false);
  });

  useEffect(() => {
    if (!active) return;

    const listener = (e: KeyboardEvent) => onKeyDown(e);

    window.addEventListener('keydown', listener);

    return () => window.removeEventListener('keydown', listener);
  }, [active]);
}
