import SHORTCUTS from './shortcuts.json' with { type: 'json' };

const MODIFIERS = { '⌃': 'ctrl', '⌥': 'alt', '⇧': 'shift', '⌘': 'mod' };
const ACCELERATOR_KEYS = { '⌫': 'Backspace', '↩': 'Enter', Esc: 'Escape' };
const DIGIT_RANGE = /^(.*?)(\d)–(\d)$/;

export function parseChord(chord) {
  const flags = { ctrl: false, alt: false, shift: false, mod: false };
  let at = 0;

  while (at < chord.length - 1 && Object.hasOwn(MODIFIERS, chord[at])) {
    flags[MODIFIERS[chord[at]]] = true;
    at += 1;
  }

  return { ...flags, key: chord.slice(at) };
}

export function expandChord(chord) {
  const range = DIGIT_RANGE.exec(chord);

  if (!range) return [chord];

  const [, prefix, from, to] = range;

  return Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => `${prefix}${Number(from) + i}`);
}

export const shortcutIds = () => Object.keys(SHORTCUTS);

export const scopeOf = (id) => SHORTCUTS[id]?.scope;

export const keysOf = (id) => SHORTCUTS[id]?.keys ?? [];

export const chordsOf = (id) => keysOf(id).flatMap(expandChord);

export function acceleratorOf(chord) {
  const { ctrl, alt, shift, mod, key } = parseChord(chord);
  const parts = [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', mod && 'CmdOrCtrl', ACCELERATOR_KEYS[key] ?? key];

  return parts.filter(Boolean).join('+');
}

export function menuAccelerator(id) {
  const chords = chordsOf(id);
  const chord = chords.find((c) => parseChord(c).mod) ?? chords[0];

  return chord && acceleratorOf(chord);
}

export function tabChord(index, count) {
  const numbered = chordsOf('go-to-scene');

  if (index < numbered.length) return numbered[index];

  return index === count - 1 ? chordsOf('last-scene')[0] : undefined;
}
