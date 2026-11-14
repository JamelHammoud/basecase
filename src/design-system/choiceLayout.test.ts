import { describe, expect, it } from 'vitest';
import { HARDWARE_BY_TYPE, sizeChoices, type HardwareType } from '../data/hardware';
import { CHOICE_GAP_PX, CHOICE_PADDING_PX, choiceMinCell, fittedColumns, labelWidth } from './choiceLayout';
import { LAYOUT } from './theme';

const SECTION_INSET = 12;
const TRACK_INSET = 2;
const FONT = 13;

const SF_PRO_13_MEDIUM_TABULAR: Array<[number, string[]]> = [
  [18.29, ['Ø2', 'Ø3', 'Ø4', 'Ø5', 'Ø6', 'Ø7', 'Ø8', 'Ø9']],
  [19.75, ['M2', 'M3', 'M4', 'M5', 'M6', 'M8']],
  [24.93, ['603', '604', '605', '608', '623', '624', '625', '626', '688']],
  [26.6, ['Ø10', 'Ø11', 'Ø12', 'Ø13', 'Ø14', 'Ø15', 'Ø16', 'Ø17', 'Ø18', 'Ø19', 'Ø20']],
  [28.06, ['M10', 'M12']],
  [32.09, ['M2.5']],
  [32.41, ['F608', 'F623', 'F624', 'F625', 'F626', 'F688']],
  [33.24, ['2020', '2040', '3030', '6000', '6001', '6200', '6700', '6800']],
  [34.84, ['3 mm', '4 mm']],
  [35.54, ['MF63', 'MF85']],
  [36.67, ['MR63', 'MR85']],
  [39.14, ['MGN7', 'MGN9']],
  [41.55, ['51100', '51101', '51102', '51103', '51104']],
  [43.85, ['MF105']],
  [44.98, ['MR105', 'MR115']],
  [46.42, ['LM3UU', 'LM4UU', 'LM5UU', 'LM6UU', 'LM8UU']],
  [46.67, ['20T Ø5', '30T Ø5', '36T Ø8', '40T Ø6', '40T Ø8', '60T Ø8']],
  [47.18, ['5.7 mm', '5.8 mm', '8.1 mm', '9.5 mm']],
  [47.45, ['MGN12', 'MGN15']],
  [48.49, ['20 × 30', '30 × 30', 'MGN7C', 'MGN9C']],
  [48.91, ['MGN7H', 'MGN9H']],
  [49.97, ['F4-10M', 'F5-12M', 'F6-14M', 'F8-16M']],
  [53.6, ['LM8LUU']],
  [54.73, ['LM10UU', 'LM12UU']],
  [55.49, ['12.7 mm']],
  [56.8, ['MGN12C', 'MGN15C']],
  [57.22, ['MGN12H', 'MGN15H']],
  [61.91, ['LM10LUU', 'LM12LUU']],
];
const measured = new Map(SF_PRO_13_MEDIUM_TABULAR.flatMap(([px, labels]) => labels.map((l) => [l, px] as const)));

const panelWidths = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const inners = [
  ...panelWidths(LAYOUT.leftPanelMin, LAYOUT.leftPanelMax),
  ...panelWidths(LAYOUT.rightPanelMin, LAYOUT.rightPanelMax),
].map((panel) => panel - 2 * SECTION_INSET - 2 * TRACK_INSET);

const rowCell = (labels: string[]) => choiceMinCell({ labels, stacked: false, icons: false });

function cellWidth(inner: number, track: { minCell: number; columns: number }) {
  const shown = fittedColumns(inner, track);

  return (inner - (shown - 1) * CHOICE_GAP_PX) / shown;
}

describe('choice grid layout', () => {
  it.each([...measured])('estimates %s at least as wide as SF Pro draws it, and within 2.5px', (label, px) => {
    expect(labelWidth(label, FONT)).toBeGreaterThanOrEqual(px);
    expect(labelWidth(label, FONT)).toBeLessThanOrEqual(px + 2.5);
  });

  it.each(Object.keys(HARDWARE_BY_TYPE) as HardwareType[])('shows every %s size whole at every panel width', (type) => {
    const { columns, options } = sizeChoices(type);
    const labels = options.map((o) => o.label);
    const track = { minCell: rowCell(labels), columns };
    const widest = Math.max(...labels.map((label) => measured.get(label) ?? labelWidth(label, FONT)));

    for (const inner of inners) expect(cellWidth(inner, track) - CHOICE_PADDING_PX.row).toBeGreaterThanOrEqual(widest);
  });

  it('keeps the asked-for columns when the labels fit', () => {
    const inner = LAYOUT.leftPanelWidth - 2 * SECTION_INSET - 2 * TRACK_INSET;
    const columnsAt = (type: HardwareType) => {
      const { columns, options } = sizeChoices(type);

      return fittedColumns(inner, { minCell: rowCell(options.map((o) => o.label)), columns });
    };

    expect(columnsAt('socket_head')).toBe(5);
    expect(columnsAt('linear_rail')).toBe(4);
  });

  it('wraps MGN rails to 3 per row where 4 would cut MGN12', () => {
    const { columns, options } = sizeChoices('linear_rail');
    const track = { minCell: rowCell(options.map((o) => o.label)), columns };
    const truncating = panelWidths(262, 271).map((panel) => panel - 2 * SECTION_INSET - 2 * TRACK_INSET);

    for (const inner of truncating) expect(fittedColumns(inner, track)).toBe(3);
  });

  it('gives a one-column grid the whole track even when its label is wider', () => {
    const minCell = rowCell(['A very long robot name '.repeat(4)]);

    expect(fittedColumns(200, { minCell, columns: 1 })).toBe(1);
    expect(cellWidth(200, { minCell, columns: 1 })).toBe(200);
  });
});
