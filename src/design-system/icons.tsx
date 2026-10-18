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

// A robot as one round body with a face looking straight ahead: two solid pill eyes, 3 wide and
// 3.75 long, a little above center. The ball is r 10.25, overshooting the 2–22 live area like the
// nut does, since circles read smaller than polygons of the same box. Filled, the eyes are holes,
// and dark holes in a bright shape read smaller than bright strokes: they're cut 3.8 wide and
// 4.55 long so they look the same size as the outline's 3 × 3.75 eyes.
const ROBOT_BALL = 'M1.75 12a10.25 10.25 0 1 0 20.5 0a10.25 10.25 0 1 0 -20.5 0';
const ROBOT_EYES = 'M9.25 9.25v3.75M14.75 9.25v3.75';
const ROBOT_EYE_HOLES = 'M9.25 8.85v4.55M14.75 8.85v4.55';

/** Robots: a round robot face, for the published robots you can insert and pose */
export const RobotsIcon: React.FC<GlyphProps> = ({ filled, className }) => {
  const mask = useId();
  return (
    <Glyph className={className}>
      {filled ? (
        <>
          <Knockout id={mask}>
            <path d={ROBOT_EYE_HOLES} strokeWidth={3.8} />
          </Knockout>
          <path d={ROBOT_BALL} fill="currentColor" mask={`url(#${mask})`} />
        </>
      ) : (
        <>
          <path d={ROBOT_BALL} />
          <path d={ROBOT_EYES} strokeWidth={3} />
        </>
      )}
    </Glyph>
  );
};

// Screw drives, seen head-on: the head as a 9.5 circle, the recess solid inside it so it reads
// as a hole at 20px. The hex is flat-sided top and bottom (r 5.4), the Torx has six rounded lobes
// (A 12.6, B 7.8), Pozidriv is the Phillips cross plus its four diagonal ribs (1.5 strokes, kept
// clear of the cross's corners so translucent idle colour doesn't double up), and the slot is a
// solid bar that stops short of the rim. Recesses fill about 60% of the head, or they read as dots.
const DRIVE_HEAD = 'M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0';
const CROSS = 'M10.55 6.1L13.45 6.1L13.45 10.55L17.9 10.55L17.9 13.45L13.45 13.45L13.45 17.9L10.55 17.9L10.55 13.45L6.1 13.45L6.1 10.55L10.55 10.55z';
const DRIVE_RECESS = {
  hex: 'M17.4 12L14.7 16.68L9.3 16.68L6.6 12L9.3 7.32L14.7 7.32z',
  torx:
    'M12 5.7L12.78 6.1L13.32 7.07L13.63 8.07L13.95 8.62L14.59 8.63L15.61 8.39L16.72 8.38L17.46 8.85L17.5 9.72L16.93 10.68L16.22 11.45L15.9 12L16.22 12.55L16.93 13.32L17.5 14.28L17.46 15.15L16.72 15.62L15.61 15.61L14.59 15.37L13.95 15.38L13.63 15.93L13.32 16.93L12.78 17.9L12 18.3L11.22 17.9L10.68 16.93L10.37 15.93L10.05 15.38L9.41 15.37L8.39 15.61L7.28 15.62L6.54 15.15L6.5 14.28L7.07 13.32L7.78 12.55L8.1 12L7.78 11.45L7.07 10.68L6.5 9.72L6.54 8.85L7.28 8.38L8.39 8.39L9.41 8.63L10.05 8.62L10.37 8.07L10.68 7.07L11.22 6.1z',
  phillips: CROSS,
  pozidriv: CROSS,
  slotted: 'M5 10.7L19 10.7L19 13.3L5 13.3z',
};
const POZIDRIV_RIBS = 'M14.26 14.26L15.96 15.96M9.74 14.26L8.04 15.96M9.74 9.74L8.04 8.04M14.26 9.74L15.96 8.04';

export type DriveGlyph = keyof typeof DRIVE_RECESS;

/** A screw drive's recess in its head (Hex, Torx, Phillips, Pozidriv, Slotted); one state */
export const DriveIcon: React.FC<{ drive: DriveGlyph; className?: string }> = ({ drive, className }) => (
  <Glyph className={className}>
    <path d={DRIVE_HEAD} />
    <path d={DRIVE_RECESS[drive]} fill="currentColor" stroke="none" />
    {drive === 'pozidriv' && <path d={POZIDRIV_RIBS} strokeWidth={1.5} />}
  </Glyph>
);
