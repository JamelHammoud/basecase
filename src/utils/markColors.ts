import { hexToHsv, normalizeHex } from '../design-system/colorMath';

export interface MarkColor {
  name: string;
  hex: string;
}

export const MARK_COLORS: MarkColor[] = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Green', hex: '#22c55e' },
];

export const DEFAULT_MARK_COLOR = MARK_COLORS[0].hex;

const HUE_NAMES: Array<[number, string]> = [
  [12, 'red'],
  [40, 'orange'],
  [68, 'yellow'],
  [165, 'green'],
  [195, 'teal'],
  [255, 'blue'],
  [290, 'purple'],
  [340, 'pink'],
  [360, 'red'],
];

export const markColorOf = (mark: { color?: string }) => normalizeHex(mark.color ?? '') ?? DEFAULT_MARK_COLOR;

export const isPresetMarkColor = (hex: string) => MARK_COLORS.some((c) => c.hex === hex.toLowerCase());

function neutralName(v: number): string {
  if (v > 0.8) return 'white';

  return v < 0.25 ? 'black' : 'grey';
}

export function markColorName(hex: string): string {
  const preset = MARK_COLORS.find((c) => c.hex === hex.toLowerCase());

  if (preset) return preset.name.toLowerCase();

  const { h, s, v } = hexToHsv(hex);

  if (s < 0.18 || v < 0.15) return neutralName(v);

  return HUE_NAMES.find(([limit]) => h < limit)?.[1] ?? 'red';
}

export function readableTextOn(hex: string): string {
  const n = normalizeHex(hex) ?? DEFAULT_MARK_COLOR;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#141414' : '#ffffff';
}
