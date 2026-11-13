import SHORTCUTS from '../../electron/shortcuts.json';
import { chordsOf, keysOf, parseChord, scopeOf, type Chord } from '../../electron/shortcutKeys.mjs';

export type ShortcutId = keyof typeof SHORTCUTS;

export type ShortcutScope = 'canvas' | 'annotate' | 'tabs' | 'composer' | 'clipboard';

export interface ShortcutKey {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type ShortcutHandlers<T = void> = Partial<Record<ShortcutId, (e: KeyboardEvent) => T>>;

const NAMED_KEYS: Record<string, string[]> = {
  '⌫': ['backspace', 'delete'],
  '↩': ['enter'],
  Esc: ['escape'],
  Tab: ['tab'],
};
const KEYS_BY_CODE: Record<string, string> = { '[': 'BracketLeft', ']': 'BracketRight' };
const SHIFT_FREE_KEYS = new Set(['?', ',']);

export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];

const BINDINGS = SHORTCUT_IDS.flatMap((id) =>
  chordsOf(id).map((chord) => ({ id, scope: scopeOf(id), chord: parseChord(chord) })),
);

export const scopeOfShortcut = (id: ShortcutId) => scopeOf(id) as ShortcutScope;

export const keyFor = (id: ShortcutId) => keysOf(id)[0];

export const paneKeys = (id: ShortcutId) => keysOf(id).flatMap((key, i) => (i === 0 ? [key] : ['or', key]));

function keyMatches(chord: Chord, e: ShortcutKey) {
  const code = KEYS_BY_CODE[chord.key];

  if (code) return e.code === code;

  return (NAMED_KEYS[chord.key] ?? [chord.key.toLowerCase()]).includes(e.key.toLowerCase());
}

function modifiersMatch(chord: Chord, e: ShortcutKey) {
  const shiftMatters = !SHIFT_FREE_KEYS.has(chord.key);
  const control = chord.ctrl ? e.ctrlKey : !chord.mod && !e.ctrlKey && !e.metaKey;

  if (shiftMatters && e.shiftKey !== chord.shift) return false;

  return e.altKey === chord.alt && (chord.mod ? e.metaKey || e.ctrlKey : control);
}

export function shortcutFor(e: ShortcutKey, scope: ShortcutScope): ShortcutId | null {
  const hit = BINDINGS.find((b) => b.scope === scope && keyMatches(b.chord, e) && modifiersMatch(b.chord, e));

  return hit?.id ?? null;
}
