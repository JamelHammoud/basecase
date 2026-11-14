import type React from 'react';

export const CHOICE_GAP_PX = 2;
export const CHOICE_PADDING_PX = { row: 12, stacked: 0 };

const ICON_BESIDE_PX = 18;
const FIT_MARGIN_PX = 1;

const GLYPH_EM = new Map(
  (
    [
      ['W', 0.99],
      ['%', 0.97],
      ['m', 0.9],
      ['M', 0.89],
      ['w', 0.81],
      ['OQØ', 0.78],
      ['GHN', 0.76],
      ['U', 0.75],
      ['D', 0.74],
      ['C&', 0.73],
      ['AVX', 0.7],
      ['BKY', 0.68],
      ['RZ', 0.67],
      ['S', 0.66],
      ['PT0123456789#+×', 0.65],
      ['bdgpq', 0.63],
      ['hoE', 0.61],
      ['nu', 0.6],
      ['eF', 0.59],
      ['L', 0.58],
      ['ackyJ', 0.57],
      ['v', 0.56],
      ['xz', 0.55],
      ['s', 0.54],
      ['?', 0.53],
      ['-', 0.48],
      ['r', 0.41],
      ['()', 0.4],
      ['t', 0.39],
      ['f', 0.38],
      ['!', 0.33],
      ["/,;:.'", 0.32],
      ['I', 0.29],
      ['| ', 0.28],
      ['ijl', 0.27],
    ] as const
  ).flatMap(([glyphs, em]) => [...glyphs].map((glyph) => [glyph, em] as const)),
);
const WIDEST_EM = 1;

export const labelWidth = (text: string, fontPx: number) =>
  [...text].reduce((width, glyph) => width + (GLYPH_EM.get(glyph) ?? WIDEST_EM) * fontPx, 0);

export interface ChoiceTrack {
  columns: number;
  labels: React.ReactNode[];
  stacked: boolean;
  icons: boolean;
}

export function choiceMinCell({ labels, stacked, icons }: Omit<ChoiceTrack, 'columns'>) {
  const texts = labels.filter((label): label is string => typeof label === 'string');

  if (!texts.length) return 0;

  const widest = Math.max(...texts.map((text) => labelWidth(text, stacked ? 12 : 13)));
  const beside = icons && !stacked ? ICON_BESIDE_PX : 0;

  return Math.ceil(widest + (stacked ? CHOICE_PADDING_PX.stacked : CHOICE_PADDING_PX.row) + beside + FIT_MARGIN_PX);
}

export const fittedColumns = (inner: number, { minCell, columns }: { minCell: number; columns: number }) =>
  Math.max(1, Math.min(columns, Math.floor((inner + CHOICE_GAP_PX) / (Math.min(minCell, inner) + CHOICE_GAP_PX))));

export function choiceGridTemplate(track: ChoiceTrack) {
  const share = `calc((100% - ${(track.columns - 1) * CHOICE_GAP_PX}px) / ${track.columns} - 0.1px)`;

  return `repeat(auto-fill, minmax(max(min(${choiceMinCell(track)}px, 100%), ${share}), 1fr))`;
}
