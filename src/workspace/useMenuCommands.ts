import { useEffect, useEffectEvent } from 'react';
import type { CameraPreset, TrackpadGestureMode } from '../types/robotics';
import { platformBridge, type AppMenuState } from '../utils/platformBridge';
import { isExportedSolid } from './exportable';
import { isTextEntry } from './helpers';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

interface MenuOptions {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
}

const EDIT_COMMANDS = new Set(['undo', 'redo', 'select-all']);
const OWN_EDIT_COMMANDS = new Set([...EDIT_COMMANDS, 'delete', 'duplicate']);

function useMenuMap({ core, actions, ui }: Omit<MenuOptions, 'active'>): Record<string, () => unknown> {
  'use memo';

  const { studio, undo, redo, selection } = core;
  const { exports, creation, robots, files, ops } = actions;

  return {
    settings: () => studio.openSettings(),
    shortcuts: () => studio.openSettings('shortcuts'),
    'find-parts': ui.findParts,
    'export-stl': exports.exportStl,
    'export-scene': () => void exports.exportScene(),
    airdrop: () => void exports.airDrop(),
    print: () => core.printing.openMode(1),
    'add-reference-image': () => creation.pickReferenceImage(),
    import: () => void files.pickImports(),
    'import-robot': robots.openImportRobot,
    undo,
    redo,
    'select-all': selection.selectAll,
    duplicate: ops.duplicateSelected,
    delete: ops.deleteSelected,
    palette: ui.togglePalette,
    'zoom-selection': ui.focusSelected,
    'reset-view': ui.resetView,
    'toggle-grid': ui.toggleGrid,
    'toggle-reference-images': ui.toggleReferenceImages,
    'toggle-sidebar': ui.toggleLeft,
    'toggle-inspector': ui.toggleRight,
  };
}

function useMenuState({ active, core }: Pick<MenuOptions, 'active' | 'core'>) {
  const { studio, selectedIds, parts } = core;
  const { isLeftOpen, isRightOpen, showGrid, showReferenceImages, trackpadMode } = studio;
  const hasSelection = selectedIds.length > 0;
  const hasParts = parts.length > 0;
  const hasSolids = parts.some(isExportedSolid);

  useEffect(() => {
    if (!active) return;

    platformBridge.setMenuState({
      sidebar: isLeftOpen,
      inspector: isRightOpen,
      grid: showGrid,
      referenceImages: showReferenceImages,
      trackpadMode,
      hasSelection,
      hasParts,
      hasSolids,
    } satisfies Partial<AppMenuState>);
  }, [active, isLeftOpen, isRightOpen, showGrid, showReferenceImages, trackpadMode, hasSelection, hasParts, hasSolids]);
}

export function useMenuCommands({ active, core, actions, ui }: MenuOptions) {
  const commands = useMenuMap({ core, actions, ui });
  const blocked = ui.paletteOpen || core.studio.settingsOpen;

  const skipEdit = (id: string) => {
    const owner = document.activeElement?.closest('[data-own-edits]');

    if (!OWN_EDIT_COMMANDS.has(id)) return false;

    if (isTextEntry(document.activeElement) && EDIT_COMMANDS.has(id)) {
      document.execCommand(id === 'select-all' ? 'selectAll' : id);

      return true;
    }

    if (owner) {
      owner.dispatchEvent(new CustomEvent('own-edit', { detail: id }));

      return true;
    }

    return EDIT_COMMANDS.has(id) && (blocked || ui.recentKeyEdit());
  };

  const runMenuCommand = useEffectEvent((id: string) => {
    if (skipEdit(id)) return;

    if (id.startsWith('view:')) {
      ui.setCameraView(id.slice(5) as CameraPreset);

      return;
    }

    if (id.startsWith('trackpad:')) {
      core.studio.setTrackpadMode(id.slice(9) as TrackpadGestureMode);

      return;
    }

    if (Object.hasOwn(commands, id)) commands[id]();
  });

  useEffect(() => (active ? platformBridge.onMenuCommand((id) => runMenuCommand(id)) : undefined), [active]);

  useMenuState({ active, core });
}
