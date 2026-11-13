import { describe, expect, it } from 'vitest';
import { HARDWARE_BY_TYPE, sizeChoices, type HardwareType } from '../data/hardware';
import { CHOICE_GAP_PX, choiceGridTemplate, labelWidth } from './choiceLayout';
import { LAYOUT } from './theme';

const SECTION_INSET = 12;
const TRACK_INSET = 2;
const ROW_PADDING = 12;
const FONT = 13;

const tracks = [LAYOUT.leftPanelMin, LAYOUT.leftPanelWidth, LAYOUT.rightPanelMin, LAYOUT.rightPanelWidth].map(
  (panel) => panel - 2 * SECTION_INSET,
);

function cellWidth(track: number, template: string) {
  const inner = track - 2 * TRACK_INSET;
  const columns = Number(/\/ (\d+) - 0\.1px/.exec(template)?.[1] ?? /repeat\((\d+),/.exec(template)?.[1]);
  const minCell = Number(/min\((\d+)px, 100%\)/.exec(template)?.[1] ?? 0);
  const share = (inner - (columns - 1) * CHOICE_GAP_PX) / columns - 0.1;
  const fitted = Math.floor((inner + CHOICE_GAP_PX) / (Math.max(Math.min(minCell, inner), share) + CHOICE_GAP_PX));
  const shown = Math.max(1, template.startsWith('repeat(auto-fill') ? fitted : columns);

  return (inner - (shown - 1) * CHOICE_GAP_PX) / shown;
}

describe('choice grid layout', () => {
  it('measures labels the way the Linear Guides picker showed them: MGN7 fit a fifth of the sidebar, MGN12 didn’t', () => {
    const fifth = (LAYOUT.leftPanelWidth - 2 * SECTION_INSET - 2 * TRACK_INSET - 4 * CHOICE_GAP_PX) / 5 - ROW_PADDING;

    expect(labelWidth('MGN7', FONT)).toBeLessThan(fifth);
    expect(labelWidth('MGN12', FONT)).toBeGreaterThan(fifth);
  });

  it.each(Object.keys(HARDWARE_BY_TYPE) as HardwareType[])('shows every %s size whole at every panel width', (type) => {
    const { columns, options } = sizeChoices(type);
    const template = choiceGridTemplate({ columns, labels: options.map((o) => o.label), stacked: false, icons: false });
    const widest = Math.max(...options.map((o) => labelWidth(o.label, FONT)));

    for (const track of tracks) expect(cellWidth(track, template) - ROW_PADDING).toBeGreaterThanOrEqual(widest);
  });

  it('keeps the asked-for columns when the labels fit, and one column never overflows', () => {
    const screws = sizeChoices('socket_head');
    const template = choiceGridTemplate({
      ...screws,
      labels: screws.options.map((o) => o.label),
      stacked: false,
      icons: false,
    });
    const robots = choiceGridTemplate({
      columns: 1,
      labels: ['A very long robot name '.repeat(4)],
      stacked: false,
      icons: false,
    });

    expect(cellWidth(tracks[1], template)).toBeCloseTo((tracks[1] - 4 - 8) / 5, 0);
    expect(cellWidth(tracks[0], robots)).toBeCloseTo(tracks[0] - 4, 0);
  });
});
