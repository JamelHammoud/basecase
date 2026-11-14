import { IS_MAC } from '../utils/os';

const WINDOWS_NAMES: Record<string, string> = {
  '⌘': 'Ctrl',
  '⌃': 'Ctrl',
  '⌥': 'Alt',
  '⇧': 'Shift',
  '⌫': 'Del',
  '↩': 'Enter',
};
const TEXT_PRESENTATION = '\uFE0E';
const MAC_CAPS: Record<string, string> = { '↩': `↩${TEXT_PRESENTATION}` };
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'];

const rank = (key: string) => {
  const at = MODIFIER_ORDER.indexOf(key);

  return at < 0 ? MODIFIER_ORDER.length : at;
};

export function platformKeys(keys: string[], mac = IS_MAC): string[] {
  const glyphs = keys.map((k) => k.replace(TEXT_PRESENTATION, ''));

  if (mac) return glyphs.map((k) => MAC_CAPS[k] ?? k);

  return glyphs.map((k) => WINDOWS_NAMES[k] ?? k).sort((a, b) => rank(a) - rank(b));
}

export const modifierName = (glyph: string, mac = IS_MAC) => (mac ? glyph : (WINDOWS_NAMES[glyph] ?? glyph));
