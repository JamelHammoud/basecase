import React, { useId } from 'react';

/**
 * The studio's own icons, drawn to sit beside lucide-react: 24 grid, 2px round strokes.
 * Each has an outline (idle) and a filled (active) state, like the tab bars in X or Apple's apps.
 * How to draw a new one: .claude/skills/icon-design/SKILL.md
 */
export interface GlyphProps {
  /** The active state: solid silhouette, inner details knocked out */
  filled?: boolean;
  className?: string;
}

const Glyph: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = 'w-[18px] h-[18px]', children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Cuts `children` out of whatever uses the mask (knockout lines and holes in filled glyphs) */
const Knockout: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <defs>
    <mask id={id} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
      <rect x="-2" y="-2" width="28" height="28" fill="#fff" stroke="none" />
      <g stroke="#000" strokeWidth={1.5} fill="none">
        {children}
      </g>
    </mask>
  </defs>
);

const LAYER_TOP = 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z';
const LAYER_LOWER = 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17';

/** Layers: lucide's stack; filled, the top sheet goes solid */
export const LayersIcon: React.FC<GlyphProps> = ({ filled, className }) => (
  <Glyph className={className}>
    {filled ? (
      <>
        <path d={LAYER_TOP} fill="currentColor" />
        <path d={LAYER_LOWER} />
      </>
    ) : (
      <path d={LAYER_TOP + LAYER_LOWER} />
    )}
  </Glyph>
);

// A hex nut seen from above at an angle: the top face, three front faces and the threaded hole.
// Corners are rounded 1.2. Rounding costs visual mass, so the nut is 19 tall and overshoots the
// sides by 0.25. The face edges start and end on the corner curves, so nothing pokes out.
const NUT =
  'M1.75 9.1Q1.75 7.9 2.58 7.03L6.05 3.37Q6.88 2.5 8.07 2.5L15.93 2.5Q17.13 2.5 17.95 3.37L21.42 7.03Q22.25 7.9 22.25 9.1L22.25 14.9Q22.25 16.1 21.42 16.97L17.95 20.63Q17.13 21.5 15.93 21.5L8.07 21.5Q6.88 21.5 6.05 20.63L2.58 16.97Q1.75 16.1 1.75 14.9Z';
const NUT_EDGES = 'M1.96 7.98L6.88 13.3H17.13L22.04 7.98M6.88 13.3V21.28M17.13 13.3V21.28';
// The filled state's cuts run past the silhouette so they reach its outer edge
const NUT_CUTS = 'M-0.3 5.74L6.88 13.3H17.13L24.3 5.74M6.88 13.3V24M17.13 13.3V24';
const NUT_HOLE = 'M8.2 7.9a3.8 2.1 0 1 0 7.6 0a3.8 2.1 0 1 0-7.6 0';

/** Parts: a hex nut, the CAD convention for a standard-parts library */
export const PartsIcon: React.FC<GlyphProps> = ({ filled, className }) => {
  const mask = useId();
  return (
    <Glyph className={className}>
      {filled ? (
        <>
          <Knockout id={mask}>
            <path d={NUT_CUTS} />
            <path d={NUT_HOLE} fill="#000" />
          </Knockout>
          <path d={NUT} fill="currentColor" mask={`url(#${mask})`} />
        </>
      ) : (
        <path d={NUT + NUT_EDGES + NUT_HOLE} />
      )}
    </Glyph>
  );
};

const BOOKMARK = 'M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5v14.7a.8.8 0 0 1-1.25.66L12 17.5l-4.75 3.36A.8.8 0 0 1 6 20.2z';

/** Library: a bookmark, for the scenes and models you saved */
export const LibraryIcon: React.FC<GlyphProps> = ({ filled, className }) => (
  <Glyph className={className}>
    <path d={BOOKMARK} fill={filled ? 'currentColor' : 'none'} />
  </Glyph>
);
