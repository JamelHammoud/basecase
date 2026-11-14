import type { PanelPlace } from '../../cases/console/consoleEdits';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface AreaBox extends Box {
  at: number;
  panels: Array<{ id: string; top: number; bottom: number }>;
}

export interface DropGeometry {
  areas: AreaBox[];
  canvas: (Box & { at: number }) | null;
}

export interface DropMark {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const AREA_EDGE = 32;
export const CANVAS_EDGE = 64;

const MARK = 3;

const within = (box: Box, x: number) => x >= box.left && x <= box.right;

const edgeColumn = (box: Box & { at: number }, x: number, edge: number): PanelPlace | null => {
  if (x - box.left < edge) return { column: box.at };

  return box.right - x < edge ? { column: box.at + 1 } : null;
};

export function dropPlace({ areas, canvas }: DropGeometry, x: number, y: number): PanelPlace | null {
  const area = areas.find((a) => within(a, x));

  if (area)
    return (
      edgeColumn(area, x, AREA_EDGE) ?? {
        area: area.at,
        index: area.panels.filter((p) => y > (p.top + p.bottom) / 2).length,
      }
    );

  return canvas && within(canvas, x) ? edgeColumn(canvas, x, CANVAS_EDGE) : null;
}

function columnX({ areas, canvas }: DropGeometry, column: number) {
  const boxes = [...areas, ...(canvas ? [canvas] : [])];
  const after = boxes.find((b) => b.at === column);
  const before = boxes.find((b) => b.at === column - 1);

  return after?.left ?? before?.right ?? 0;
}

export function dropMark(g: DropGeometry, place: PanelPlace): DropMark | null {
  const boxes = [...g.areas, ...(g.canvas ? [g.canvas] : [])];
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.bottom));

  if ('column' in place) return { left: columnX(g, place.column) - MARK / 2, top, width: MARK, height: bottom - top };

  const area = g.areas.find((a) => a.at === place.area);

  if (!area) return null;

  const y = place.index === 0 ? area.top : (area.panels[place.index - 1]?.bottom ?? area.bottom);

  return { left: area.left, top: y - MARK / 2, width: area.right - area.left, height: MARK };
}
