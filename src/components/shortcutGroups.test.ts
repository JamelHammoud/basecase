import { describe, expect, it } from 'vitest';
import { chordsOf, parseChord } from '../../electron/shortcutKeys.mjs';
import {
  SHORTCUT_IDS,
  scopeOfShortcut,
  shortcutFor,
  type ShortcutId,
  type ShortcutKey,
  type ShortcutScope,
} from '../app/shortcuts';
import { tabCommandForKey } from '../app/tabShortcuts';
import { tabActions, type TabCommands } from '../app/useAppMenu';
import { CLIPBOARD_EVENTS } from '../workspace/useClipboard';
import { workspaceKeyHandlers, type WorkspaceKeyDeps } from '../workspace/useWorkspaceKeys';
import { composerKeyHandlers, type ComposerKeyState } from './agent/composerKeys';
import { timelineKeyHandlers } from './simulate/useTimelineKeys';
import { SHORTCUT_GROUPS, type ShortcutGroup } from './shortcutGroups';

const ARTICLE = import.meta.glob<string>('../../site/content/help/keyboard-shortcuts.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})['../../site/content/help/keyboard-shortcuts.md'];

const isActionRow = (line: string) => line.startsWith('| ') && !line.startsWith('| Action ');

function articleGroups(markdown: string) {
  const groups: Array<{ title: string; actions: string[] }> = [];

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) groups.push({ title: line.slice(3).trim(), actions: [] });
    else if (isActionRow(line)) groups.at(-1)?.actions.push(line.split('|')[1].trim());
  }

  return groups;
}

const anything: unknown = new Proxy(() => anything, { get: () => anything, apply: () => anything });

const TAB_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const EVENT_KEYS: Record<string, string> = {
  '⌫': 'Backspace',
  '↩': 'Enter',
  Esc: 'Escape',
  '[': '{',
  ']': '}',
  Space: ' ',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
};
const CODES: Record<string, string> = { '[': 'BracketLeft', ']': 'BracketRight' };
const POINTER = /\b(drag|click|double-click)\b/;
const TYPED_BY_THE_FIELD = new Set(['⇧↩', '/']);

function eventFor(chord: string): ShortcutKey {
  const { ctrl, alt, shift, mod, key } = parseChord(chord);

  return {
    key: EVENT_KEYS[key] ?? key.toLowerCase(),
    code: CODES[key],
    metaKey: mod,
    ctrlKey: ctrl,
    shiftKey: shift || key === '?',
    altKey: alt,
  };
}

type Handled = Record<ShortcutScope, (chord: string) => string | null>;

const handledIn = (ids: Iterable<string>, scope: ShortcutScope) => (chord: string) => {
  const id = shortcutFor(eventFor(chord), scope);

  return id && new Set(ids).has(id) ? id : null;
};

function tabsHandle(chord: string) {
  const command = tabCommandForKey(eventFor(chord), TAB_IDS);
  const actions = tabActions(anything as TabCommands);

  if (!command || !(command.startsWith('tab:') || Object.hasOwn(actions, command))) return null;

  return shortcutFor(eventFor(chord), 'tabs');
}

const CANVAS_IDS = Object.keys(workspaceKeyHandlers(anything as WorkspaceKeyDeps));
const COMPOSER_IDS = Object.keys(composerKeyHandlers(anything as ComposerKeyState));
const TIMELINE_IDS = Object.keys(timelineKeyHandlers(anything as Parameters<typeof timelineKeyHandlers>[0]));

const HANDLED: Handled = {
  canvas: handledIn(CANVAS_IDS, 'canvas'),
  annotate: handledIn(CANVAS_IDS, 'annotate'),
  tabs: tabsHandle,
  composer: handledIn(COMPOSER_IDS, 'composer'),
  clipboard: handledIn(CLIPBOARD_EVENTS, 'clipboard'),
  timeline: handledIn(TIMELINE_IDS, 'timeline'),
};

function rowProblem([label, keys]: [string, ShortcutId | string[]], handled: Handled) {
  if (Array.isArray(keys)) {
    const described = POINTER.test(keys.join(' ')) || keys.every((k) => TYPED_BY_THE_FIELD.has(k));

    return described ? null : `${label}: lists ${keys.join(' ')} with nothing behind it`;
  }

  const scope = scopeOfShortcut(keys);
  const dead = scope ? chordsOf(keys).filter((chord) => handled[scope](chord) !== keys) : [keys];

  return dead.length > 0 ? `${label}: ${dead.join(', ')} does nothing` : null;
}

function brokenShortcuts(groups: ShortcutGroup[], handled: Handled = HANDLED) {
  const rows = groups.flatMap((g) => g.rows);
  const listed = new Set(rows.map(([, keys]) => keys).filter((k): k is ShortcutId => typeof k === 'string'));
  const unlistedKeys = SHORTCUT_IDS.filter((id) => !listed.has(id)).map((id) => `${id}: handled but not listed`);
  const unlistedHandlers = [...CANVAS_IDS, ...COMPOSER_IDS, ...TIMELINE_IDS, ...CLIPBOARD_EVENTS]
    .filter((id) => !SHORTCUT_IDS.includes(id as ShortcutId))
    .map((id) => `${id}: has a handler but no key`);

  return [
    ...rows.map((row) => rowProblem(row, handled)).flatMap((p) => (p ? [p] : [])),
    ...unlistedKeys,
    ...unlistedHandlers,
  ];
}

const withRow = (title: string, row: ShortcutGroup['rows'][number]) =>
  SHORTCUT_GROUPS.map((g) => (g.title === title ? { ...g, rows: [...g.rows, row] } : g));

describe('the Shortcuts pane', () => {
  it('lists the same shortcuts, under the same names, as the Keyboard shortcuts article', () => {
    const pane = SHORTCUT_GROUPS.map((g) => ({ title: g.title, actions: g.rows.map(([label]) => label) }));

    expect(articleGroups(ARTICLE)).toEqual(pane);
  });

  it('lists every handled key, and each listed key reaches its handler', () => {
    expect(brokenShortcuts(SHORTCUT_GROUPS)).toEqual([]);
  });

  it('catches a listed key with nothing behind it', () => {
    expect(brokenShortcuts(withRow('Scenes', ['Save scene', ['⌘S']]))).toEqual([
      'Save scene: lists ⌘S with nothing behind it',
    ]);
    expect(brokenShortcuts(withRow('Scenes', ['Save scene', 'save-scene' as ShortcutId]))).toEqual([
      'Save scene: save-scene does nothing',
    ]);
    expect(brokenShortcuts(SHORTCUT_GROUPS, { ...HANDLED, canvas: () => null })).toContain('Undo: ⌘Z does nothing');
  });

  it('catches a handled key the pane leaves out', () => {
    const groups = SHORTCUT_GROUPS.map((g) => ({ ...g, rows: g.rows.filter(([label]) => label !== 'Duplicate') }));

    expect(brokenShortcuts(groups)).toEqual(['duplicate: handled but not listed']);
  });

  it('tells apart keys that share a letter by where they work', () => {
    expect(shortcutFor(eventFor('P'), 'canvas')).toBe('show-pose');
    expect(shortcutFor(eventFor('P'), 'annotate')).toBe('marker');
    expect(shortcutFor(eventFor('⌘↩'), 'canvas')).toBe('run-routine');
    expect(shortcutFor(eventFor('⌘↩'), 'composer')).toBe('queue');
    expect(shortcutFor({ ...eventFor('⌘Z'), shiftKey: true }, 'canvas')).toBe('redo');
    expect(shortcutFor({ ...eventFor('F'), altKey: true }, 'canvas')).toBeNull();
  });

  it('leaves the keys the field types to the field', () => {
    for (const chord of TYPED_BY_THE_FIELD) expect(shortcutFor(eventFor(chord), 'composer')).toBeNull();

    expect(shortcutFor(eventFor('⇧⌫'), 'canvas')).toBeNull();
    expect(shortcutFor(eventFor('?'), 'canvas')).toBe('shortcuts');
  });
});
