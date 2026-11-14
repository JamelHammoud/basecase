import { describe, expect, it } from 'vitest';
import { CASE_WORLDS } from '../cases/caseWorlds';
import { DRIVES, FINISHES, HARDWARE_BY_TYPE, sizeChoices, type HardwareType } from '../data/hardware';
import { CHOICE_GAP_PX, CHOICE_PADDING_PX, choiceMinCell, fittedColumns, labelWidth } from './choiceLayout';
import { LAYOUT } from './theme';

const SECTION_INSET = 12;
const TRACK_INSET = 2;
const ROW_FONT = 13;
const STACKED_FONT = 12;
const DOT_BESIDE = 18;
const BRUSHES = ['Inflate', 'Carve', 'Grab', 'Flatten', 'Smooth', 'Pinch'];

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
  [26.97, ['Zinc']],
  [30.15, ['Grab']],
  [31.59, ['Steel']],
  [31.92, ['Shelf']],
  [33.92, ['Black']],
  [34.39, ['Block']],
  [34.52, ['Pinch']],
  [34.65, ['Silver']],
  [34.74, ['Brass']],
  [35.07, ['Slope']],
  [35.65, ['Steps']],
  [35.81, ['Nylon']],
  [36.24, ['Carve']],
  [39.19, ['Inflate']],
  [39.6, ['Ahead']],
  [43.09, ['Flatten']],
  [48.07, ['Smooth']],
  [51.75, ['Corridor']],
  [56.23, ['Stainless']],
  [68.25, ['Open Floor']],
  [89.05, ['Rough Ground']],
];
const SF_PRO_12_MEDIUM_TABULAR: Array<[number, string[]]> = [
  [22.37, ['Hex']],
  [25.14, ['Torx']],
  [41.72, ['Phillips']],
  [41.87, ['Slotted']],
  [46.57, ['Pozidriv']],
];
const table = (rows: Array<[number, string[]]>) =>
  new Map(rows.flatMap(([px, labels]) => labels.map((l) => [l, px] as const)));
const measured: Record<number, Map<string, number>> = {
  [ROW_FONT]: table(SF_PRO_13_MEDIUM_TABULAR),
  [STACKED_FONT]: table(SF_PRO_12_MEDIUM_TABULAR),
};

const panelWidths = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const innerOf = (panel: number) => panel - 2 * SECTION_INSET - 2 * TRACK_INSET;
const inners = [
  ...panelWidths(LAYOUT.leftPanelMin, LAYOUT.leftPanelMax),
  ...panelWidths(LAYOUT.rightPanelMin, LAYOUT.rightPanelMax),
].map(innerOf);

interface Grid {
  labels: string[];
  columns: number;
  stacked?: boolean;
  icons?: boolean;
}

const sizeGrid = (type: HardwareType): Grid => {
  const { columns, options } = sizeChoices(type);

  return { labels: options.map((o) => o.label), columns };
};

const drives = Object.values(DRIVES).map((d) => d.label);
const finishes = [...new Set(Object.values(FINISHES).map((f) => f.label))];
const worlds = CASE_WORLDS.map((w) => w.name);

const OTHER_GRIDS: Record<string, Grid> = {
  Drive: { labels: drives, columns: drives.length, stacked: true },
  Finish: { labels: finishes, columns: 3, icons: true },
  Brush: { labels: BRUSHES, columns: 3 },
  World: { labels: worlds, columns: 2 },
  Spot: { labels: ['Ahead'], columns: 2 },
};

const fontOf = (grid: Grid) => (grid.stacked ? STACKED_FONT : ROW_FONT);
const trackOf = (grid: Grid) => ({
  minCell: choiceMinCell({ labels: grid.labels, stacked: !!grid.stacked, icons: !!grid.icons }),
  columns: grid.columns,
});
const columnsAt = (panel: number, grid: Grid) => fittedColumns(innerOf(panel), trackOf(grid));

function cellWidth(inner: number, track: { minCell: number; columns: number }) {
  const shown = fittedColumns(inner, track);

  return (inner - (shown - 1) * CHOICE_GAP_PX) / shown;
}

function expectWholeEverywhere(grid: Grid) {
  const font = fontOf(grid);
  const widest = Math.max(...grid.labels.map((label) => measured[font].get(label) ?? labelWidth(label, font)));
  const around = (grid.stacked ? CHOICE_PADDING_PX.stacked : CHOICE_PADDING_PX.row) + (grid.icons ? DOT_BESIDE : 0);

  for (const inner of inners) expect(cellWidth(inner, trackOf(grid)) - around).toBeGreaterThanOrEqual(widest);
}

const calibration = [ROW_FONT, STACKED_FONT].flatMap((font) =>
  [...measured[font]].map(([l, px]): [string, number, number] => [l, font, px]),
);

describe('choice grid layout', () => {
  it.each(calibration)('estimates %s at %ipx at least as wide as SF Pro draws it, and within 2.5px', (l, font, px) => {
    expect(labelWidth(l, font)).toBeGreaterThanOrEqual(px);
    expect(labelWidth(l, font)).toBeLessThanOrEqual(px + 2.5);
  });

  it.each(Object.entries(OTHER_GRIDS))('has a measured width for every %s label', (_, grid) => {
    for (const label of grid.labels) expect(measured[fontOf(grid)].has(label)).toBe(true);
  });

  it.each(Object.keys(HARDWARE_BY_TYPE) as HardwareType[])('shows every %s size whole at every panel width', (type) =>
    expectWholeEverywhere(sizeGrid(type)),
  );

  it.each(Object.entries(OTHER_GRIDS))('shows every %s choice whole at every panel width', (_, grid) =>
    expectWholeEverywhere(grid),
  );

  it('keeps the asked-for columns at the default panel widths when the labels fit', () => {
    expect(columnsAt(LAYOUT.leftPanelWidth, sizeGrid('socket_head'))).toBe(5);
    expect(columnsAt(LAYOUT.leftPanelWidth, sizeGrid('linear_rail'))).toBe(4);
    expect(columnsAt(LAYOUT.leftPanelWidth, OTHER_GRIDS.Drive)).toBe(5);
    expect(columnsAt(LAYOUT.rightPanelWidth, OTHER_GRIDS.Finish)).toBe(3);
    expect(columnsAt(LAYOUT.leftPanelWidth, OTHER_GRIDS.World)).toBe(2);
    expect(columnsAt(LAYOUT.leftPanelMin, OTHER_GRIDS.Brush)).toBe(3);
  });

  it('wraps a grid only where its asked-for columns would cut a label', () => {
    const stainless = measured[ROW_FONT].get('Stainless') ?? 0;
    const thirdOfSidebar = (innerOf(LAYOUT.leftPanelWidth) - 2 * CHOICE_GAP_PX) / 3;

    expect(thirdOfSidebar - CHOICE_PADDING_PX.row - DOT_BESIDE).toBeLessThan(stainless);
    expect(columnsAt(LAYOUT.leftPanelWidth, OTHER_GRIDS.Finish)).toBe(2);

    for (const panel of panelWidths(262, 271)) expect(columnsAt(panel, sizeGrid('linear_rail'))).toBe(3);
  });

  it('gives a one-column grid the whole track even when its label is wider', () => {
    const minCell = choiceMinCell({ labels: ['A very long robot name '.repeat(4)], stacked: false, icons: false });

    expect(fittedColumns(200, { minCell, columns: 1 })).toBe(1);
    expect(cellWidth(200, { minCell, columns: 1 })).toBe(200);
  });
});
