type Point = [number, number];

type Glyph = { width: number; lines: Point[][] };

export type Stroke = [x0: number, y0: number, x1: number, y1: number];

const BOWL_TOP: Point[] = [
  [0, 1],
  [0.4, 1],
  [0.52, 0.94],
  [0.57, 0.8],
  [0.57, 0.68],
  [0.52, 0.55],
  [0.4, 0.48],
  [0, 0.48],
];

const OPEN_RING: Point[] = [
  [0.58, 0.85],
  [0.48, 0.97],
  [0.32, 1],
  [0.16, 0.95],
  [0.05, 0.8],
  [0, 0.6],
  [0, 0.4],
  [0.05, 0.2],
  [0.16, 0.05],
  [0.32, 0],
  [0.48, 0.03],
];

const ring = (cx: number, rx: number): Point[] =>
  Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;

    return [cx + rx * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
  });

const GLYPHS: Record<string, Glyph> = {
  A: {
    width: 0.6,
    lines: [
      [
        [0, 0],
        [0.3, 1],
        [0.6, 0],
      ],
      [
        [0.11, 0.36],
        [0.49, 0.36],
      ],
    ],
  },
  B: {
    width: 0.58,
    lines: [
      [[0, 0], ...BOWL_TOP],
      [
        [0.4, 0.48],
        [0.54, 0.42],
        [0.58, 0.3],
        [0.58, 0.18],
        [0.54, 0.07],
        [0.42, 0],
        [0, 0],
      ],
    ],
  },
  C: { width: 0.58, lines: [[...OPEN_RING, [0.58, 0.15]]] },
  D: {
    width: 0.58,
    lines: [
      [
        [0, 0],
        [0, 1],
        [0.3, 1],
        [0.48, 0.9],
        [0.58, 0.7],
        [0.58, 0.3],
        [0.48, 0.1],
        [0.3, 0],
        [0, 0],
      ],
    ],
  },
  E: {
    width: 0.55,
    lines: [
      [
        [0.55, 1],
        [0, 1],
        [0, 0],
        [0.55, 0],
      ],
      [
        [0, 0.52],
        [0.45, 0.52],
      ],
    ],
  },
  F: {
    width: 0.55,
    lines: [
      [
        [0.55, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [0, 0.52],
        [0.45, 0.52],
      ],
    ],
  },
  G: {
    width: 0.58,
    lines: [[...OPEN_RING, [0.58, 0.12], [0.58, 0.45], [0.34, 0.45]]],
  },
  H: {
    width: 0.58,
    lines: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0.58, 0],
        [0.58, 1],
      ],
      [
        [0, 0.52],
        [0.58, 0.52],
      ],
    ],
  },
  I: {
    width: 0.3,
    lines: [
      [
        [0, 1],
        [0.3, 1],
      ],
      [
        [0.15, 1],
        [0.15, 0],
      ],
      [
        [0, 0],
        [0.3, 0],
      ],
    ],
  },
  J: {
    width: 0.5,
    lines: [
      [
        [0.5, 1],
        [0.5, 0.25],
        [0.45, 0.08],
        [0.3, 0],
        [0.15, 0.03],
        [0.04, 0.14],
        [0, 0.28],
      ],
    ],
  },
  K: {
    width: 0.58,
    lines: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0.55, 1],
        [0, 0.4],
      ],
      [
        [0.18, 0.6],
        [0.58, 0],
      ],
    ],
  },
  L: {
    width: 0.52,
    lines: [
      [
        [0, 1],
        [0, 0],
        [0.52, 0],
      ],
    ],
  },
  M: {
    width: 0.7,
    lines: [
      [
        [0, 0],
        [0, 1],
        [0.35, 0.4],
        [0.7, 1],
        [0.7, 0],
      ],
    ],
  },
  N: {
    width: 0.58,
    lines: [
      [
        [0, 0],
        [0, 1],
        [0.58, 0],
        [0.58, 1],
      ],
    ],
  },
  O: { width: 0.62, lines: [ring(0.31, 0.31)] },
  P: { width: 0.57, lines: [[[0, 0], ...BOWL_TOP]] },
  Q: {
    width: 0.64,
    lines: [
      ring(0.31, 0.31),
      [
        [0.38, 0.25],
        [0.64, 0],
      ],
    ],
  },
  R: {
    width: 0.58,
    lines: [
      [[0, 0], ...BOWL_TOP],
      [
        [0.3, 0.48],
        [0.58, 0],
      ],
    ],
  },
  S: {
    width: 0.55,
    lines: [
      [
        [0.55, 0.85],
        [0.45, 0.96],
        [0.28, 1],
        [0.12, 0.96],
        [0.03, 0.85],
        [0.03, 0.7],
        [0.12, 0.6],
        [0.45, 0.42],
        [0.55, 0.3],
        [0.55, 0.15],
        [0.45, 0.04],
        [0.28, 0],
        [0.1, 0.04],
        [0, 0.15],
      ],
    ],
  },
  T: {
    width: 0.6,
    lines: [
      [
        [0, 1],
        [0.6, 1],
      ],
      [
        [0.3, 1],
        [0.3, 0],
      ],
    ],
  },
  U: {
    width: 0.58,
    lines: [
      [
        [0, 1],
        [0, 0.3],
        [0.05, 0.12],
        [0.15, 0.02],
        [0.29, 0],
        [0.43, 0.02],
        [0.53, 0.12],
        [0.58, 0.3],
        [0.58, 1],
      ],
    ],
  },
  V: {
    width: 0.6,
    lines: [
      [
        [0, 1],
        [0.3, 0],
        [0.6, 1],
      ],
    ],
  },
  W: {
    width: 0.78,
    lines: [
      [
        [0, 1],
        [0.18, 0],
        [0.39, 0.7],
        [0.6, 0],
        [0.78, 1],
      ],
    ],
  },
  X: {
    width: 0.58,
    lines: [
      [
        [0, 1],
        [0.58, 0],
      ],
      [
        [0, 0],
        [0.58, 1],
      ],
    ],
  },
  Y: {
    width: 0.6,
    lines: [
      [
        [0, 1],
        [0.3, 0.5],
        [0.6, 1],
      ],
      [
        [0.3, 0.5],
        [0.3, 0],
      ],
    ],
  },
  Z: {
    width: 0.58,
    lines: [
      [
        [0, 1],
        [0.58, 1],
        [0, 0],
        [0.58, 0],
      ],
    ],
  },
};

export const LETTER_GAP = 0.22;

export const canWrite = (text: string) => text.length > 0 && [...text].every((c) => c in GLYPHS);

export function textWidth(text: string): number {
  return [...text].reduce((w, c, i) => w + GLYPHS[c].width + (i ? LETTER_GAP : 0), 0);
}

export function textStrokes(text: string): Stroke[] {
  const strokes: Stroke[] = [];
  let x = 0;

  for (const c of text) {
    const glyph = GLYPHS[c];

    for (const line of glyph.lines)
      for (let i = 1; i < line.length; i++)
        strokes.push([x + line[i - 1][0], line[i - 1][1], x + line[i][0], line[i][1]]);

    x += glyph.width + LETTER_GAP;
  }

  return strokes;
}
