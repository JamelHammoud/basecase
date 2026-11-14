import { parseCase, type Case } from '../schema';
import { errorMessage } from '../../utils/errorMessage';
import { isCanvas, placedOn, withoutPlace } from './codeEdits';
import { AREA_MAX, AREA_MIN, type CaseConsole, type ConsoleArea } from './format';
import type { PanelKind, PanelSpec } from './panelKinds';

export type PanelDrop = { area: number; before?: string } | { area: number; column: 'before' | 'after' };

export type NewPanel = { kind: Exclude<PanelKind, 'code'>; title?: string } & Record<string, unknown>;

const LEAVING = '\u0000leaving';

export const kindName = (kind: PanelKind) => kind[0].toUpperCase() + kind.slice(1);

export const panelName = (panel: PanelSpec) => panel.title ?? kindName(panel.kind);

export const snappedSize = (size: number) => Math.round(Math.min(AREA_MAX, Math.max(AREA_MIN, size)));

function marked(areas: ConsoleArea[], id: string): ConsoleArea[] {
  return areas.map((a) => {
    if (isCanvas(a))
      return a.overlays?.length ? { canvas: true, overlays: a.overlays.filter((o) => o.panel !== id) } : a;

    return { ...a, panels: a.panels.map((p) => (p === id ? LEAVING : p)) };
  });
}

function landed(area: ConsoleArea, id: string, before: string | undefined): ConsoleArea {
  if (isCanvas(area)) return area;

  const at = before === undefined ? -1 : area.panels.indexOf(before === id ? LEAVING : before);

  return { ...area, panels: at < 0 ? [...area.panels, id] : area.panels.toSpliced(at, 0, id) };
}

function sizeFrom(areas: ConsoleArea[], id: string, fallback: number) {
  const from = areas.find((a) => !isCanvas(a) && a.panels.includes(id));

  return from && !isCanvas(from) ? from.size : fallback;
}

export function movedPanel(c: CaseConsole, id: string, drop: PanelDrop): CaseConsole {
  const areas = marked(c.layout.areas, id);
  const target = areas[drop.area];

  if (!target) return c;

  const placed =
    'column' in drop
      ? areas.toSpliced(drop.area + (drop.column === 'after' ? 1 : 0), 0, {
          size: sizeFrom(c.layout.areas, id, 320),
          panels: [id],
        })
      : areas.map((a, i) => (i === drop.area ? landed(a, id, drop.before) : a));

  return { ...c, layout: { areas: withoutPlace(placed, LEAVING) } };
}

export const resizedArea = (c: CaseConsole, area: number, size: number): CaseConsole => ({
  ...c,
  layout: {
    areas: c.layout.areas.map((a, i) => (i === area && !isCanvas(a) ? { ...a, size: snappedSize(size) } : a)),
  },
});

export const renamedPanel = (c: CaseConsole, id: string, title: string): CaseConsole => ({
  ...c,
  panels: c.panels.map((p) => (p.id === id ? { ...p, title } : p)),
});

export const removedPanel = (c: CaseConsole, id: string): CaseConsole => ({
  ...c,
  panels: c.panels.filter((p) => p.id !== id),
  layout: { areas: withoutPlace(c.layout.areas, id) },
});

function freeId(c: CaseConsole, kind: PanelKind) {
  const taken = new Set(c.panels.map((p) => p.id));
  let n = 1;

  while (taken.has(n === 1 ? kind : `${kind}-${n}`)) n++;

  return n === 1 ? kind : `${kind}-${n}`;
}

export function addedPanel(c: CaseConsole, panel: NewPanel, area?: number): { console: CaseConsole; id: string } {
  const id = freeId(c, panel.kind);
  const spec = { ...panel, id, title: panel.title ?? kindName(panel.kind) } as PanelSpec;
  const into = area === undefined ? undefined : c.layout.areas[area];
  const areas =
    into && !isCanvas(into)
      ? c.layout.areas.map((a, i) => (i === area ? landed(a, id, undefined) : a))
      : placedOn(c.layout.areas, id, { side: 'right' });

  return { id, console: { ...c, panels: [...c.panels, spec], layout: { areas } } };
}

export function checkedConsole(kase: Case, next: CaseConsole): Case | string {
  try {
    return parseCase({ ...kase, console: next });
  } catch (e) {
    return errorMessage(e);
  }
}
