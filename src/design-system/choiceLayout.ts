import type React from 'react';

export const CHOICE_GAP_PX = 2;

const PADDING_PX = { row: 12, stacked: 4 };
const ICON_PX = 22;

const GLYPH_EM: Array<[RegExp, number]> = [
  [/[\s.,:;'|!]/, 0.28],
  [/[ijlrtfI]/, 0.32],
  [/\d/, 0.62],
  [/[A-Z]/, 0.72],
  [/[a-z]/, 0.55],
];
const OTHER_EM = 0.7;

export const labelWidth = (text: string, fontPx: number) =>
  [...text].reduce((width, ch) => width + (GLYPH_EM.find(([glyph]) => glyph.test(ch))?.[1] ?? OTHER_EM) * fontPx, 0);

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

  return Math.ceil(widest + (stacked ? PADDING_PX.stacked : PADDING_PX.row) + beside);
}

export function choiceGridTemplate(track: ChoiceTrack) {
  const share = `calc((100% - ${(track.columns - 1) * CHOICE_GAP_PX}px) / ${track.columns} - 0.1px)`;

  return `repeat(auto-fill, minmax(max(min(${choiceMinCell(track)}px, 100%), ${share}), 1fr))`;
}
