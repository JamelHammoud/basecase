import { TAG_BORDER_CELLS, TAG_CELLS, type FloorPoint } from '../../cameras/mat/tag36h11';
import type { CaseMat, MatOutline, MatSheet, MatTag } from './matLayout';

export const BASE_TAG_ID = 100;
export const MAT_TAG_MM = 140;
export const MAT_MARGIN_MM = 100;
export const MAT_TAG_AREA_MM = (MAT_TAG_MM * TAG_CELLS) / TAG_BORDER_CELLS;

const MAX_TAG_GAP_MM = 1000;
const MAX_GROWTH = 8;

export type MatContent = Pick<CaseMat, 'start' | 'spots' | 'path' | 'outlines'>;

export interface FloorBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface Grid {
  pageLeftX: number;
  top: number;
  cols: number;
  rows: number;
}

type SheetSize = { width: number; height: number };

type Side = 'top' | 'bottom' | 'left' | 'right';

const CORNER_SIGNS: FloorPoint[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

export function rectCorners(rect: Omit<MatOutline, 'yawDeg'> & { yawDeg?: number }): FloorPoint[] {
  const yaw = ((rect.yawDeg ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];

  return CORNER_SIGNS.map(([sx, sz]) => {
    const [lx, lz] = [(sx * rect.width) / 2, (sz * rect.depth) / 2];

    return [rect.center[0] + c * lx + s * lz, rect.center[1] - s * lx + c * lz];
  });
}

const boxOf = (points: FloorPoint[]): FloorBox => ({
  x0: Math.min(...points.map((p) => p[0])),
  x1: Math.max(...points.map((p) => p[0])),
  z0: Math.min(...points.map((p) => p[1])),
  z1: Math.max(...points.map((p) => p[1])),
});

const rectBoxes = (content: MatContent): FloorBox[] =>
  [content.start, ...content.outlines].map((r) => boxOf(rectCorners(r)));

const boxesMeet = (a: FloorBox, b: FloorBox) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

function circleMeets(center: FloorPoint, radius: number, box: FloorBox): boolean {
  const dx = center[0] - Math.min(box.x1, Math.max(box.x0, center[0]));
  const dz = center[1] - Math.min(box.z1, Math.max(box.z0, center[1]));

  return Math.hypot(dx, dz) < radius;
}

export function segmentMeets(a: FloorPoint, b: FloorPoint, box: FloorBox): boolean {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const limits: Array<[number, number]> = [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dz, a[1] - box.z0],
    [dz, box.z1 - a[1]],
  ];
  let [t0, t1] = [0, 1];

  for (const [p, q] of limits) {
    if (p === 0 && q < 0) return false;

    if (p < 0) t0 = Math.max(t0, q / p);
    else if (p > 0) t1 = Math.min(t1, q / p);
  }

  return t0 <= t1;
}

export function contentMeets(content: MatContent, box: FloorBox): boolean {
  const legs = content.path.slice(1).map((to, i): [FloorPoint, FloorPoint] => [content.path[i], to]);

  return (
    rectBoxes(content).some((r) => boxesMeet(r, box)) ||
    content.spots.some((s) => circleMeets(s.center, s.radius, box)) ||
    legs.some(([a, b]) => segmentMeets(a, b, box))
  );
}

function contentBox(content: MatContent): FloorBox {
  const points = [
    ...[content.start, ...content.outlines].flatMap((r) => rectCorners(r)),
    ...content.spots.flatMap((s): FloorPoint[] => [
      [s.center[0] - s.radius, s.center[1] - s.radius],
      [s.center[0] + s.radius, s.center[1] + s.radius],
    ]),
    ...content.path,
  ];

  return boxOf(points);
}

const cellsOver = (span: number, cell: number) => Math.max(2, Math.ceil(span / cell - 1e-9));

function initialGrid(content: MatContent, size: SheetSize): Grid {
  const box = contentBox(content);
  const pageLeftX = box.x1 + MAT_MARGIN_MM;
  const top = box.z1 + MAT_MARGIN_MM;

  return {
    pageLeftX,
    top,
    cols: cellsOver(pageLeftX - (box.x0 - MAT_MARGIN_MM), size.width),
    rows: cellsOver(top - (box.z0 - MAT_MARGIN_MM), size.height),
  };
}

function perimeter(grid: Grid): Array<[column: number, row: number]> {
  const { cols, rows } = grid;
  const top = Array.from({ length: cols }, (_, c): [number, number] => [c, 0]);
  const right = Array.from({ length: rows - 1 }, (_, r): [number, number] => [cols - 1, r + 1]);
  const bottom = Array.from({ length: cols - 1 }, (_, c): [number, number] => [cols - 2 - c, rows - 1]);
  const left = Array.from({ length: rows - 2 }, (_, r): [number, number] => [0, rows - 2 - r]);

  return [...top, ...right, ...bottom, ...left];
}

export const sheetCenter = (sheet: MatSheet): FloorPoint => [sheet.x0 + sheet.width / 2, sheet.z0 + sheet.height / 2];

function sheetAt(grid: Grid, size: SheetSize, column: number, row: number): MatSheet {
  const x0 = grid.pageLeftX - (column + 1) * size.width;
  const z0 = grid.top - (row + 1) * size.height;

  return { column, row, x0, z0, width: size.width, height: size.height };
}

export function tagArea(tag: MatTag): FloorBox {
  const half = (tag.size * TAG_CELLS) / TAG_BORDER_CELLS / 2;

  return { x0: tag.center[0] - half, x1: tag.center[0] + half, z0: tag.center[1] - half, z1: tag.center[1] + half };
}

function edgeSide(index: number, last: number, [first, final]: [Side, Side]): Side | null {
  if (index === 0) return first;

  return index === last ? final : null;
}

function sideOf(grid: Grid, [column, row]: [number, number]): Side {
  const vertical = edgeSide(row, grid.rows - 1, ['top', 'bottom']);
  const horizontal = edgeSide(column, grid.cols - 1, ['left', 'right']);
  const rowIsCheaper = grid.cols <= grid.rows;

  if (vertical && (rowIsCheaper || !horizontal)) return vertical;

  return horizontal ?? 'top';
}

function grown(grid: Grid, size: SheetSize, sides: Set<Side>): Grid {
  return {
    pageLeftX: sides.has('left') ? grid.pageLeftX + size.width : grid.pageLeftX,
    top: sides.has('top') ? grid.top + size.height : grid.top,
    cols: grid.cols + Number(sides.has('left')) + Number(sides.has('right')),
    rows: grid.rows + Number(sides.has('top')) + Number(sides.has('bottom')),
  };
}

interface Edge {
  from: number;
  steps: number;
  spacing: number;
  side: Side;
}

function edgesOf(grid: Grid, size: SheetSize): Edge[] {
  const across = grid.cols - 1;
  const down = grid.rows - 1;

  return [
    { from: 0, steps: across, spacing: size.width, side: 'top' },
    { from: across, steps: down, spacing: size.height, side: 'right' },
    { from: across + down, steps: across, spacing: size.width, side: 'bottom' },
    { from: 2 * across + down, steps: down, spacing: size.height, side: 'left' },
  ];
}

function farthestClear(at: number, reach: number, clear: (step: number) => boolean): number | null {
  for (let step = at + reach; step > at; step--) if (clear(step)) return step;

  return null;
}

function edgePicks(edge: Edge, gap: number, clear: (index: number) => boolean) {
  const reach = Math.max(1, Math.floor(gap / edge.spacing));
  const picks = [edge.from];
  let at = 0;
  let blocked = false;

  while (edge.steps - at > reach) {
    const next = farthestClear(at, reach, (step) => clear(edge.from + step));

    blocked ||= next === null;
    at = next ?? at + reach;
    picks.push(edge.from + at);
  }

  return { picks, blocked };
}

function ringPicks(edges: Edge[], clear: (index: number) => boolean): { picks: number[]; blocked: Side[] } {
  let gap = MAX_TAG_GAP_MM;
  let plans = edges.map((e) => edgePicks(e, gap, clear));

  while (plans.flatMap((p) => p.picks).length >= BASE_TAG_ID) {
    gap *= 2;
    plans = edges.map((e) => edgePicks(e, gap, clear));
  }

  return { picks: plans.flatMap((p) => p.picks), blocked: edges.filter((_, i) => plans[i].blocked).map((e) => e.side) };
}

function planTags(grid: Grid, size: SheetSize, content: MatContent): { tags: MatTag[]; grow: Set<Side> } {
  const ring = perimeter(grid);
  const centers = ring.map(([column, row]) => sheetCenter(sheetAt(grid, size, column, row)));
  const clearAt = centers.map((center) => !contentMeets(content, tagArea({ id: 0, center, size: MAT_TAG_MM })));
  const clear = (index: number) => clearAt[index % ring.length];
  const edges = edgesOf(grid, size);
  const { picks, blocked } = ringPicks(edges, clear);
  const corners = edges.filter((e) => !clear(e.from)).map((e) => sideOf(grid, ring[e.from]));

  return {
    tags: picks.map((index, id) => ({ id, center: centers[index], size: MAT_TAG_MM })),
    grow: new Set([...corners, ...blocked]),
  };
}

export function placeTags(content: MatContent, size: SheetSize): { sheets: MatSheet[]; tags: MatTag[] } {
  let grid = initialGrid(content, size);
  let plan = planTags(grid, size, content);

  for (let i = 0; i < MAX_GROWTH && plan.grow.size; i++) {
    grid = grown(grid, size, plan.grow);
    plan = planTags(grid, size, content);
  }

  const sheets = Array.from({ length: grid.rows * grid.cols }, (_, i) =>
    sheetAt(grid, size, i % grid.cols, Math.floor(i / grid.cols)),
  );

  return { sheets, tags: plan.tags };
}
