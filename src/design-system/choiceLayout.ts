import type React from 'react';

export const CHOICE_GAP_PX = 2;
export const CHOICE_PADDING_PX = { row: 12, stacked: 4 };

const ICON_PX = 22;
const FIT_MARGIN_PX = 1;

const GLYPH_EM = new Map(
  (
    [
      ['W%', 0.99],
      ['Mm', 0.9],
      ['w', 0.81],
      ['OQØ', 0.78],
      ['HNGU', 0.76],
      ['DC&', 0.74],
      ['XAVKYBRZ', 0.7],
      ['SPT#+×0123456789', 0.66],
      ['bdpqg', 0.63],
      ['Ehonu', 0.61],
      ['eFLcaky', 0.59],
      ['Jvzxs', 0.57],
      ['?', 0.53],
      ['-', 0.48],
      ['rt()f', 0.41],
      ["!/,;:.'", 0.33],
      ['Il|ij ', 0.29],
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
  const beside = icons && !stacked ? ICON_PX : 0;

  return Math.ceil(widest + (stacked ? CHOICE_PADDING_PX.stacked : CHOICE_PADDING_PX.row) + beside + FIT_MARGIN_PX);
}

export const fittedColumns = (inner: number, { minCell, columns }: { minCell: number; columns: number }) =>
  Math.max(1, Math.min(columns, Math.floor((inner + CHOICE_GAP_PX) / (Math.min(minCell, inner) + CHOICE_GAP_PX))));

export function choiceGridTemplate(track: ChoiceTrack) {
  const share = `calc((100% - ${(track.columns - 1) * CHOICE_GAP_PX}px) / ${track.columns} - 0.1px)`;

  return `repeat(auto-fill, minmax(max(min(${choiceMinCell(track)}px, 100%), ${share}), 1fr))`;
}
