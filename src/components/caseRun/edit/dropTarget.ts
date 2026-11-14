import type { PanelDrop } from '../../../cases/console/consoleEdits';

export interface AreaBox {
  at: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  panels: Array<{ id: string; top: number; bottom: number }>;
}

export interface DropLine {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DropAt {
  drop: PanelDrop;
  line: DropLine;
}

export const COLUMN_EDGE = 24;

const LINE = 2;

const inside = (a: AreaBox, x: number, y: number) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom;

const column = (a: AreaBox, after: boolean): DropAt => ({
  drop: { column: after ? a.at + 1 : a.at },
  line: { x: after ? a.right - LINE : a.left, y: a.top, width: LINE, height: a.bottom - a.top },
});

export function dropAt(areas: readonly AreaBox[], x: number, y: number): DropAt | null {
  const area = areas.find((a) => inside(a, x, y));

  if (!area) return null;

  if (x - area.left < COLUMN_EDGE) return column(area, false);

  if (area.right - x < COLUMN_EDGE) return column(area, true);

  const next = area.panels.find((p) => y < (p.top + p.bottom) / 2);
  const at = next ? next.top : (area.panels.at(-1)?.bottom ?? area.top);

  return {
    drop: next ? { area: area.at, before: next.id } : { area: area.at },
    line: { x: area.left, y: Math.max(area.top, at - LINE / 2), width: area.right - area.left, height: LINE },
  };
}

export function areaBoxes(root: ParentNode): AreaBox[] {
  return [...root.querySelectorAll<HTMLElement>('[data-area-card]')].map((card) => {
    const r = card.getBoundingClientRect();
    const panels = [...card.querySelectorAll<HTMLElement>('[data-panel]')].map((el) => {
      const p = el.getBoundingClientRect();

      return { id: el.dataset.panel ?? '', top: p.top, bottom: p.bottom };
    });

    return { at: Number(card.dataset.areaCard), left: r.left, right: r.right, top: r.top, bottom: r.bottom, panels };
  });
}
