export type ShortcutRow = [string, string[]];

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
      ['Zoom to selection', ['Z']],
      ['Isometric view', ['1']],
      ['Top view', ['2']],
      ['Front view', ['3']],
      ['Side view', ['4']],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['Move', ['V', 'or', 'W']],
      ['Rotate', ['E']],
      ['Scale', ['R']],
      ['Sculpt', ['C']],
      ['Sculpt inverted', ['⌥', 'drag']],
      ['Show pose', ['P']],
      ['Comment', ['M']],
      ['Measure', ['D']],
      ['Measure without snapping', ['⇧', 'click']],
      ['Measure vertically', ['⌥', 'click']],
      ['Annotate', ['N']],
      ['Marker while annotating', ['P']],
      ['Eraser while annotating', ['E']],
      ['Shapes', ['A']],
      ['Drop to floor', ['F']],
      ['Stack on part below', ['S']],
      ['Move or rotate without snapping', ['⇧', 'drag']],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Undo', ['⌘Z']],
      ['Redo', ['⇧⌘Z', 'or', '⌘Y']],
      ['Add to selection', ['⇧', 'click']],
      ['Box select', ['⇧', 'drag']],
      ['Select a part inside a group', ['⌘', 'click', 'or', 'double-click']],
      ['Select all', ['⌘A']],
      ['Copy', ['⌘C']],
      ['Cut', ['⌘X']],
      ['Paste', ['⌘V']],
      ['Group', ['⌘G']],
      ['Ungroup', ['⇧⌘G']],
      ['Duplicate', ['⌘D']],
      ['Delete', ['⌫']],
      ['Deselect', ['Esc']],
    ],
  },
  {
    title: 'Scenes',
    rows: [
      ['New scene', ['⌘T']],
      ['Show scenes', ['⌘O']],
      ['Close scene', ['⌘W']],
      ['Reopen closed scene', ['⇧⌘T']],
      ['Next scene', ['⌃Tab', 'or', '⇧⌘]']],
      ['Previous scene', ['⌃⇧Tab', 'or', '⇧⌘[']],
      ['Go to scene 1–8', ['⌘1–8']],
      ['Go to last scene', ['⌘9']],
    ],
  },
  {
    title: 'App',
    rows: [
      ['Command menu', ['⌘K']],
      ['Find parts', ['⌘F']],
      ['Show or hide sidebar', ['⌘B']],
      ['Show or hide inspector', ['⌘I']],
      ['Show or hide reference images', ['⇧I']],
      ['Show or hide camera views', ['⇧V']],
      ['Print', ['⌘P']],
      ['Run Routine', ['⌘↩']],
      ['Settings', ['⌘,']],
      ['Keyboard shortcuts', ['?']],
    ],
  },
  {
    title: 'Agent',
    desktopOnly: true,
    rows: [
      ['Send', ['↩']],
      ['New line', ['⇧↩']],
      ['Queue', ['⌘↩']],
      ['Stop', ['Esc']],
      ['Slash commands', ['/']],
    ],
  },
];
