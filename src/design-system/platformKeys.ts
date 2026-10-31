import { IS_MAC } from '../utils/os';

const WINDOWS_NAMES: Record<string, string> = { '⌘': 'Ctrl', '⌃': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift', '⌫': 'Del' };
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'];

const rank = (key: string) => {
  const at = MODIFIER_ORDER.indexOf(key);

  return at < 0 ? MODIFIER_ORDER.length : at;
};

export function platformKeys(keys: string[], mac = IS_MAC): string[] {
  if (mac) return keys;

  return keys.map((k) => WINDOWS_NAMES[k] ?? k).sort((a, b) => rank(a) - rank(b));
}

export const modifierName = (glyph: string, mac = IS_MAC) => (mac ? glyph : (WINDOWS_NAMES[glyph] ?? glyph));
