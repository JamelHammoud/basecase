import { errorMessage } from '../../utils/errorMessage';
import { parseCase, type Case } from '../schema';
import { SIDE_SIZE, withoutPlace } from './codeEdits';
import { AREA_MAX, AREA_MIN, type CaseConsole, type ConsoleArea } from './format';
import { DEFAULT_CONSOLE } from './layout';
import type { PanelKind, PanelSpec } from './panelKinds';

export type PanelPlace = { area: number; index: number } | { column: number };

export type PanelDraft = { kind: PanelKind } & Record<string, unknown>;

export type ConsoleCheck = { ok: true; kase: Case } | { ok: false; problem: string };

type PanelArea = Extract<ConsoleArea, { panels: string[] }>;

const isPanelArea = (a: ConsoleArea | undefined): a is PanelArea => !!a && 'panels' in a;

export const editableConsole = (c: CaseConsole | undefined): CaseConsole => structuredClone(c ?? DEFAULT_CONSOLE);

export const snapAreaSize = (size: number) => Math.round(Math.min(AREA_MAX, Math.max(AREA_MIN, size)));

export function checkedConsole(kase: Case, next: CaseConsole | undefined): ConsoleCheck {
  try {
    return { ok: true, kase: parseCase({ ...kase, console: next }) };
  } catch (e) {
    return { ok: false, problem: errorMessage(e) };
  }
}

export function movePanel(c: CaseConsole, id: string, to: PanelPlace): CaseConsole {
  const areas = c.layout.areas.map((a) => (isPanelArea(a) ? { ...a, panels: [...a.panels] } : a));
  const from = areas.find((a) => isPanelArea(a) && a.panels.includes(id)) as PanelArea | undefined;
  const target = 'column' in to ? { size: from?.size ?? SIDE_SIZE, panels: [] } : areas[to.area];

  if (!from || !isPanelArea(target)) return c;

  const shift = from === target && from.panels.indexOf(id) < ('index' in to ? to.index : 0) ? 1 : 0;

  from.panels.splice(from.panels.indexOf(id), 1);
  target.panels.splice(('index' in to ? to.index : 0) - shift, 0, id);

  if ('column' in to) areas.splice(to.column, 0, target);

  return { ...c, layout: { areas: areas.filter((a) => !isPanelArea(a) || a.panels.length) } };
}

export function resizeArea(c: CaseConsole, at: number, size: number): CaseConsole {
  const area = c.layout.areas[at];

  if (!isPanelArea(area)) return c;

  return {
    ...c,
    layout: { areas: c.layout.areas.map((a, i) => (i === at ? { ...area, size: snapAreaSize(size) } : a)) },
  };
}

const freshId = (c: CaseConsole, kind: PanelKind) => {
  const taken = new Set(c.panels.map((p) => p.id));
  let n = 1;

  while (taken.has(n === 1 ? kind : `${kind}-${n}`)) n++;

  return n === 1 ? kind : `${kind}-${n}`;
};

const lastPanelArea = (areas: ConsoleArea[]) => areas.findLastIndex(isPanelArea);

export function addPanel(c: CaseConsole, draft: PanelDraft, area?: number): { console: CaseConsole; id: string } {
  const id = freshId(c, draft.kind);
  const at = area ?? lastPanelArea(c.layout.areas);
  const into = c.layout.areas[at];
  const areas = isPanelArea(into)
    ? c.layout.areas.map((a, i) => (i === at ? { ...into, panels: [...into.panels, id] } : a))
    : [...c.layout.areas, { size: SIDE_SIZE, panels: [id] }];

  return { id, console: { ...c, panels: [...c.panels, { ...draft, id } as PanelSpec], layout: { areas } } };
}

export const removePanel = (c: CaseConsole, id: string): CaseConsole => ({
  ...c,
  panels: c.panels.filter((p) => p.id !== id),
  layout: { areas: withoutPlace(c.layout.areas, id) },
});

export const renamePanel = (c: CaseConsole, id: string, title: string): CaseConsole => ({
  ...c,
  panels: c.panels.map((p): PanelSpec => {
    if (p.id !== id) return p;

    const rest = Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'title'));

    return (title.trim() ? { ...rest, title: title.trim() } : rest) as PanelSpec;
  }),
});
