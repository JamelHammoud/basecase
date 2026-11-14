import { parseCase, type Case } from '../schema';
import { errorMessage } from '../../utils/errorMessage';
import { isCanvas, placedOn, withoutPlace } from './codeEdits';
import {
  AREA_MAX,
  AREA_MIN,
  MAX_AREA_PANELS,
  MAX_AREAS,
  MAX_PANELS,
  type CaseConsole,
  type ConsoleArea,
} from './format';
import type { PanelKind, PanelSpec } from './panelKinds';
import { headed, shownName } from './panelNames';

export type PanelDrop = { area: number; before?: string } | { area: number; column: 'before' | 'after' };

export type NewPanel = { kind: Exclude<PanelKind, 'code'>; title?: string } & Record<string, unknown>;

const LEAVING = '\u0000leaving';

export const TITLE_MAX = 80;

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
  panels: c.panels.map((p) => (p.id === id ? { ...p, title: title.slice(0, TITLE_MAX) } : p)),
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

function titled(panel: NewPanel, id: string): PanelSpec {
  const spec = { ...panel, id } as PanelSpec;

  return spec.title || !headed(spec.kind) ? spec : { ...spec, title: shownName(spec) };
}

function nearestColumn(areas: ConsoleArea[]) {
  const at = areas.findIndex(isCanvas);
  const right = areas.findIndex((a, i) => i > at && !isCanvas(a));

  return right < 0 ? areas.findLastIndex((a) => !isCanvas(a)) : right;
}

function intoArea(areas: ConsoleArea[], id: string, area: number | undefined) {
  const at = area ?? (areas.length < MAX_AREAS ? undefined : nearestColumn(areas));
  const into = at === undefined ? undefined : areas[at];

  if (into && !isCanvas(into)) return areas.map((a, i) => (i === at ? landed(a, id, undefined) : a));

  return placedOn(areas, id, { side: 'right' });
}

export function addedPanel(c: CaseConsole, panel: NewPanel, area?: number): { console: CaseConsole; id: string } {
  const id = freeId(c, panel.kind);
  const spec = titled(panel, id);
  const areas = intoArea(c.layout.areas, id, area);

  return { id, console: { ...c, panels: [...c.panels, spec], layout: { areas } } };
}

export function consoleLimit(c: CaseConsole): string | null {
  if (c.panels.length > MAX_PANELS) return `A console holds up to ${MAX_PANELS} panels`;

  return c.layout.areas.some((a) => !isCanvas(a) && a.panels.length > MAX_AREA_PANELS)
    ? `A column holds up to ${MAX_AREA_PANELS} panels`
    : null;
}

export function checkedConsole(kase: Case, next: CaseConsole): Case | string {
  try {
    return parseCase({ ...kase, console: next });
  } catch (e) {
    return errorMessage(e);
  }
}
