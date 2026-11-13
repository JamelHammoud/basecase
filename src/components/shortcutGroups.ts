import type { ShortcutId } from '../app/shortcuts';

export type ShortcutRow = [string, ShortcutId | string[]];

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
  desktopOnly?: boolean;
}

export const SCULPT_ROWS = new Set(['Sculpt', 'Sculpt inverted']);

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigate',
    rows: [
      ['Pan', ['Space', 'drag']],
      ['Zoom to selection', 'zoom-selection'],
      ['Isometric view', 'view:isometric'],
      ['Top view', 'view:top'],
      ['Front view', 'view:front'],
      ['Side view', 'view:right'],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['Move', 'move'],
      ['Rotate', 'rotate'],
      ['Scale', 'scale'],
      ['Sculpt', 'sculpt'],
      ['Sculpt inverted', ['⌥', 'drag']],
      ['Show pose', 'show-pose'],
      ['Comment', 'comment'],
      ['Measure', 'measure'],
      ['Measure without snapping', ['⇧', 'click']],
      ['Measure vertically', ['⌥', 'click']],
      ['Annotate', 'annotate'],
      ['Marker while annotating', 'marker'],
      ['Eraser while annotating', 'eraser'],
      ['Shapes', 'shapes'],
      ['Drop to floor', 'drop-to-floor'],
      ['Stack on part below', 'stack'],
      ['Move or rotate without snapping', ['⇧', 'drag']],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Undo', 'undo'],
      ['Redo', 'redo'],
      ['Add to selection', ['⇧', 'click']],
      ['Box select', ['⇧', 'drag']],
      ['Select a part inside a group', ['⌘', 'click', 'or', 'double-click']],
      ['Select all', 'select-all'],
      ['Copy', 'copy'],
      ['Cut', 'cut'],
      ['Paste', 'paste'],
      ['Group', 'group'],
      ['Ungroup', 'ungroup'],
      ['Duplicate', 'duplicate'],
      ['Delete', 'delete'],
      ['Deselect', 'deselect'],
    ],
  },
  {
    title: 'Scenes',
    rows: [
      ['New scene', 'new-scene'],
      ['Show scenes', 'open-scenes'],
      ['Close scene', 'close-tab'],
      ['Reopen closed scene', 'reopen-tab'],
      ['Next scene', 'next-tab'],
      ['Previous scene', 'prev-tab'],
      ['Go to scene 1–8', 'go-to-scene'],
      ['Go to last scene', 'last-scene'],
    ],
  },
  {
    title: 'App',
    rows: [
      ['Command menu', 'palette'],
      ['Find parts', 'find-parts'],
      ['Show or hide sidebar', 'toggle-sidebar'],
      ['Show or hide inspector', 'toggle-inspector'],
      ['Show or hide reference images', 'toggle-reference-images'],
      ['Show or hide camera views', 'toggle-camera-views'],
      ['Print', 'print'],
      ['Run Routine', 'run-routine'],
      ['Settings', 'settings'],
      ['Keyboard shortcuts', 'shortcuts'],
    ],
  },
  {
    title: 'Agent',
    desktopOnly: true,
    rows: [
      ['Send', 'send'],
      ['New line', ['⇧↩']],
      ['Queue', 'queue'],
      ['Stop', 'stop'],
      ['Slash commands', ['/']],
    ],
  },
];
