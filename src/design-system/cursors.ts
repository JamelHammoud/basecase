export const ARROW_PATH =
  'M3.48 4.51 Q2.99 2.99 4.44 3.65 L15.76 8.84 Q18.49 10.09 15.58 10.82 L15.46 10.85 Q11.39 11.89 9.66 15.72 L9.42 16.25 Q8.19 18.99 7.26 16.13 Z';

const SHADOW =
  '<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#000" flood-opacity="0.5"/></filter>';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><defs>${SHADOW}</defs>${body}</svg>`;

const cursor = (body: string, x: number, y: number, fallback: string) =>
  `image-set(url("data:image/svg+xml,${encodeURIComponent(svg(body))}") 2x) ${x} ${y}, ${fallback}`;

export const cursorSvg = svg;

export const CURSOR_BODIES = {
  arrow: `<path d="${ARROW_PATH}" fill="#141414" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" filter="url(#s)"/>`,
  comment:
    '<path d="M3 17 A10 10 0 0 1 13 7 A10 10 0 0 1 23 17 A10 10 0 0 1 13 27 H5 A2 2 0 0 1 3 25 Z" fill="#141414" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" filter="url(#s)"/>',
  crosshair:
    '<g stroke-linecap="round"><path d="M16 5 V12 M16 20 V27 M5 16 H12 M20 16 H27" stroke="#141414" stroke-opacity="0.85" stroke-width="3.5"/>' +
    '<path d="M16 5 V12 M16 20 V27 M5 16 H12 M20 16 H27" stroke="#fff" stroke-width="1.5"/>' +
    '<circle cx="16" cy="16" r="1.6" fill="#fff" stroke="#141414" stroke-opacity="0.85" stroke-width="1"/></g>',
} as const;

export const CURSORS = {
  arrow: cursor(CURSOR_BODIES.arrow, 3, 3, 'default'),
  comment: cursor(CURSOR_BODIES.comment, 3, 27, 'crosshair'),
  crosshair: cursor(CURSOR_BODIES.crosshair, 16, 16, 'crosshair'),
} as const;
