export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function normalizeHex(raw: string): string | null {
  let h = raw.trim().replace(/^#/, '');

  if (/^[0-9a-f]{3}$/i.test(h))
    h = h
      .split('')
      .map((c) => c + c)
      .join('');

  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

function hueOf({ r, g, b }: { r: number; g: number; b: number }): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h: number;

  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  h *= 60;

  return h < 0 ? h + 360 : h;
}

export function hexToHsv(hex: string): Hsv {
  const n = normalizeHex(hex) ?? '#ffffff';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h = d ? hueOf({ r, g, b }) : 0;

  return { h, s: max ? d / max : 0, v: max };
}

const SECTOR_LIMITS = [60, 120, 180, 240, 300];

function hueSector(h: number): number {
  const i = SECTOR_LIMITS.findIndex((limit) => h < limit);

  return i === -1 ? SECTOR_LIMITS.length : i;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const sectors = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = sectors[hueSector(h)];
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${to(r)}${to(g)}${to(b)}`;
}
