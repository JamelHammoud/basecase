import type { ToolIcon } from '../guideTypes';

const INK = '#111';

const bar = (d: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 2.6}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="#fff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const line = (d: string, width = 2.2, extra = '') =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

const svg = (body: string, view = 64) =>
  `<svg viewBox="0 0 ${view} ${view}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const driver = (tip: string) =>
  svg(
    bar('M10 54 L24 40', 11) +
      line('M13.5 46.5 L19 41', 1.6) +
      line('M17.5 50.5 L23 45', 1.6) +
      bar('M27 37 L48 16', 2.6) +
      tip,
  );

const TOOLS: Record<ToolIcon, string> = {
  'hex-key': svg(bar('M14 52 L42 24 Q44.5 21.5 47 24 L53 30', 4.2)),
  torx: driver(
    `<path d="M51 9 l1.6 3.4 3.7-.6-2.1 3.1 2.1 3.1-3.7-.6L51 21l-1.6-3.6-3.7.6 2.1-3.1-2.1-3.1 3.7.6z" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  ),
  screwdriver: driver(line('M47.5 9.5 L54.5 16.5 M54.5 9.5 L47.5 16.5', 2.4)),
  'flat-screwdriver': driver(line('M46 11 L53 18', 3.2)),
  wrench: svg(
    bar('M13 51 L38 26', 7) +
      `<path d="M47 11a10 10 0 1 0 6 6l-7 7-6-6 7-7z" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  ),
  'soldering-iron': svg(
    bar('M8 56 L22 42', 8) +
      bar('M24 40 L40 24', 3.4) +
      `<path d="M40 24 L47 17 L44 25 Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
      line('M50 26 q3 -3 0 -6 q-3 -3 0 -6', 1.8) +
      line('M56 30 q3 -3 0 -6 q-3 -3 0 -6', 1.8),
  ),
  printer: svg(
    `<rect x="9" y="10" width="46" height="44" rx="4" fill="#fff" stroke="${INK}" stroke-width="2.4"/>` +
      line('M9 20 H55') +
      `<rect x="26" y="20" width="12" height="7" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M30 27 L32 31 L34 27 Z" fill="${INK}"/>` +
      `<rect x="25" y="38" width="14" height="8" rx="1" fill="#e6e6e6" stroke="${INK}" stroke-width="2"/>` +
      line('M15 46 H49', 2.6),
  ),
};

export const toolIcon = (icon: ToolIcon) => TOOLS[icon];

export const rotateIcon = () =>
  svg(
    line('M50 32 A18 18 0 1 1 41 16.4', 3) +
      `<path d="M36 9 L46 15 L37 23 Z" fill="${INK}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
  );

export const mirrorIcon = () =>
  svg(
    line('M32 6 V58', 2, ' stroke-dasharray="4 4"') +
      `<path d="M26 14 L8 50 H26 Z" fill="${INK}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M38 14 L56 50 H38 Z" fill="#fff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  );

export const checkMark = () =>
  svg(
    `<circle cx="32" cy="32" r="26" fill="#fff" stroke="${INK}" stroke-width="3"/>` +
      line('M20 33 L28.5 41.5 L45 24', 4.5),
  );

export const crossMark = () =>
  svg(
    `<circle cx="32" cy="32" r="26" fill="#fff" stroke="${INK}" stroke-width="3"/>` +
      line('M22 22 L42 42 M42 22 L22 42', 4.5),
  );

const block = `<path d="M8 40 L32 28 L56 40 L32 52 Z" fill="#f2f2f2" stroke="${INK}" stroke-width="2"/><path d="M8 40 V48 L32 60 L56 48 V40" fill="#e2e2e2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

export const snugPictogram = () =>
  svg(
    block +
      bar('M32 6 V34', 3) +
      line('M23 14 A10 4 0 0 0 41 14', 2.2) +
      `<path d="M41 14 l-4 -1.5 l1 4 z" fill="${INK}"/>`,
  );

export const overtightPictogram = () =>
  svg(
    block +
      bar('M32 6 V34', 3) +
      line('M20 12 A12 4.5 0 0 0 44 12 M18 18 A14 5 0 0 0 46 18', 2.2) +
      `<path d="M44 12 l-4 -1.5 l1 4 z M46 18 l-4 -1.5 l1 4 z" fill="${INK}"/>` +
      line('M24 44 l-5 4 l3 1 l-4 4 M41 45 l5 3 l-3 1.5 l4 3', 1.8),
  );

export const layoutPictogram = () =>
  svg(
    `<rect x="6" y="10" width="52" height="44" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.2"/>` +
      `<rect x="12" y="16" width="14" height="10" rx="1.5" fill="#e6e6e6" stroke="${INK}" stroke-width="1.8"/>` +
      `<circle cx="38" cy="21" r="5" fill="#e6e6e6" stroke="${INK}" stroke-width="1.8"/>` +
      `<path d="M12 36 h10 v12 h-10 z" fill="#e6e6e6" stroke="${INK}" stroke-width="1.8"/>` +
      line('M30 38 H50 M30 44 H46 M30 50 H50', 1.8),
  );
