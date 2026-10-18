// Canvas cursors (Figma-style). Drawn on a 32 × 32 CSS px grid and shipped as 2x SVGs in an
// image-set, so they stay sharp on Retina. The OS draws them, so they never lag the pointer;
// each hotspot is the exact point the cursor's tip shows.

/**
 * The canvas arrow, shared with the agent's cursor (AgentCursor) so yours and Claude's read as a pair.
 * Every corner is rounded (1.6 px cut at the tip, 3 at the wings, 4.2 at the notch), and the tip
 * sits so the 1.5 px stroke's outer edge lands exactly on (3, 3).
 */
export const ARROW_PATH =
  'M3.48 4.51 Q2.99 2.99 4.44 3.65 L15.76 8.84 Q18.49 10.09 15.58 10.82 L15.46 10.85 Q11.39 11.89 9.66 15.72 L9.42 16.25 Q8.19 18.99 7.26 16.13 Z';

const SHADOW =
  '<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#000" flood-opacity="0.5"/></filter>';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32"><defs>${SHADOW}</defs>${body}</svg>`;

/** CSS `cursor` value: the SVG at 2x with its hotspot in CSS px, then a system fallback */
const cursor = (body: string, x: number, y: number, fallback: string) =>
  `image-set(url("data:image/svg+xml,${encodeURIComponent(svg(body))}") 2x) ${x} ${y}, ${fallback}`;

/** The SVG markup alone, for previews */
export const cursorSvg = svg;

export const CURSOR_BODIES = {
  arrow: `<path d="${ARROW_PATH}" fill="#141414" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" filter="url(#s)"/>`,
  // The pin's shape (round on three corners, a sharp tip bottom-left) at 20 px, in the arrow's colors.
  // Its tip corner is the hotspot, which is where the pin's own corner lands on click.
  comment:
    '<path d="M3 17 A10 10 0 0 1 13 7 A10 10 0 0 1 23 17 A10 10 0 0 1 13 27 H5 A2 2 0 0 1 3 25 Z" fill="#141414" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" filter="url(#s)"/>',
  // Thin cross with an open centre, outlined dark so it reads on light and dark parts
  crosshair:
    '<g stroke-linecap="round"><path d="M16 5 V12 M16 20 V27 M5 16 H12 M20 16 H27" stroke="#141414" stroke-opacity="0.85" stroke-width="3.5"/>' +
    '<path d="M16 5 V12 M16 20 V27 M5 16 H12 M20 16 H27" stroke="#fff" stroke-width="1.5"/>' +
    '<circle cx="16" cy="16" r="1.6" fill="#fff" stroke="#141414" stroke-opacity="0.85" stroke-width="1"/></g>',
} as const;

export const CURSORS = {
  /** The canvas's default pointer */
  arrow: cursor(CURSOR_BODIES.arrow, 3, 3, 'default'),
  /** Comment tool (M): drops a pin at the bubble's tip */
  comment: cursor(CURSOR_BODIES.comment, 3, 27, 'crosshair'),
  /** Sculpt tool */
  crosshair: cursor(CURSOR_BODIES.crosshair, 16, 16, 'crosshair'),
} as const;
