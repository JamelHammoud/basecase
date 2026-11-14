import { errorMessage } from '../../utils/errorMessage';
import { titleCase } from '../../utils/titleCase';
import { parseCase, type Case } from '../schema';
import { copyOf, isCanvas, placedOn, SIDE_SIZE, withoutPanel, withoutPlace, type ConsoleEdit } from './codeEdits';
import { AREA_MAX, AREA_MIN, MAX_AREA_PANELS, MAX_AREAS, MAX_PANELS, type CaseConsole } from './format';
import {
  CASE_ACTION_LABELS,
  CASE_ACTIONS,
  PANEL_KIND_NAMES,
  readPanelConfig,
  type PanelKind,
  type PanelSpec,
} from './panelKinds';
import type { SignalScope } from './signalNames';

export type PanelDrop = { area: number; before?: string } | { column: number };

export type AddableKind = Exclude<PanelKind, 'code'>;

export const ADDABLE_KINDS = PANEL_KIND_NAMES.filter((k): k is AddableKind => k !== 'code');

export interface PanelChoice {
  label: string;
  config: Record<string, unknown>;
  title?: string;
}

const MOVING = '\u0000moving';

export const kindLabel = (kind: PanelKind) => titleCase(kind);

export function panelName(panel: PanelSpec): string {
  if (panel.title) return panel.title;

  if (panel.kind === 'button') return CASE_ACTION_LABELS[panel.action];

  return 'of' in panel && typeof panel.of === 'string' ? titleCase(panel.of) : kindLabel(panel.kind);
}

const has = (c: CaseConsole, id: string) => c.panels.some((p) => p.id === id);

const insertedBefore = (ids: string[], id: string, before: string | undefined) => {
  const at = before === undefined ? -1 : ids.indexOf(before);

  return at < 0 ? [...ids, id] : ids.toSpliced(at, 0, id);
};

export function movePanel(current: CaseConsole | undefined, id: string, to: PanelDrop): CaseConsole | null {
  const next = copyOf(current);

  if (!has(next, id)) return null;

  const marked =
    'column' in to
      ? next.layout.areas.toSpliced(to.column, 0, { size: SIDE_SIZE, panels: [MOVING] })
      : next.layout.areas.map((a, i) =>
          i === to.area && !isCanvas(a) ? { ...a, panels: insertedBefore(a.panels, MOVING, to.before) } : a,
        );
  const areas = withoutPlace(marked, id).map((a) =>
    isCanvas(a) ? a : { ...a, panels: a.panels.map((p) => (p === MOVING ? id : p)) },
  );

  return { ...next, layout: { areas } };
}

export const areaSize = (size: number) => Math.round(Math.min(AREA_MAX, Math.max(AREA_MIN, size)));

export function resizeArea(current: CaseConsole | undefined, at: number, size: number): CaseConsole | null {
  const next = copyOf(current);
  const area = next.layout.areas[at];

  if (!area || isCanvas(area)) return null;

  const areas = next.layout.areas.map((a, i) => (i === at ? { ...area, size: areaSize(size) } : a));

  return { ...next, layout: { areas } };
}

const freshId = (c: CaseConsole, kind: PanelKind) => {
  const taken = new Set(c.panels.map((p) => p.id));
  let n = 1;

  while (taken.has(n === 1 ? kind : `${kind}-${n}`)) n++;

  return n === 1 ? kind : `${kind}-${n}`;
};

export function addPanel(
  current: CaseConsole | undefined,
  add: { kind: AddableKind; choice: PanelChoice; area?: number },
): CaseConsole {
  const next = copyOf(current);
  const id = freshId(next, add.kind);
  const { title, config } = add.choice;
  const panel = { id, kind: add.kind, ...(title === undefined ? {} : { title }), ...config } as PanelSpec;
  const target = add.area === undefined ? undefined : next.layout.areas[add.area];
  const areas =
    target && !isCanvas(target)
      ? next.layout.areas.map((a) => (a === target ? { ...target, panels: [...target.panels, id] } : a))
      : placedOn(next.layout.areas, id, { side: 'right' });

  return { ...next, panels: [...next.panels, panel], layout: { areas } };
}

export function deletePanel(current: CaseConsole | undefined, id: string): CaseConsole | null {
  const next = copyOf(current);

  return has(next, id) ? withoutPanel(next, id) : null;
}

export function renamePanel(current: CaseConsole | undefined, id: string, title: string): CaseConsole | null {
  const next = copyOf(current);

  if (!has(next, id)) return null;

  return { ...next, panels: next.panels.map((p) => (p.id === id ? { ...p, title } : p)) };
}

export const fits = (c: CaseConsole | null): c is CaseConsole =>
  !!c &&
  c.panels.length <= MAX_PANELS &&
  c.layout.areas.length <= MAX_AREAS &&
  c.layout.areas.every((a) => isCanvas(a) || a.panels.length <= MAX_AREA_PANELS);

export const roomToAdd = (current: CaseConsole | undefined, area?: number) =>
  fits(addPanel(current, { kind: 'map', choice: { label: '', config: {} }, area }));

export function handEdited(kase: Case, next: CaseConsole | null): Case | null {
  if (!fits(next)) return null;

  try {
    return parseCase({ ...kase, console: next });
  } catch {
    return null;
  }
}

const signalChoice = (title: boolean, config: (name: string) => Record<string, unknown>) => (names: string[]) =>
  names.map((name) => ({ label: name, config: config(name), ...(title ? { title: name } : {}) }));

const ofChoices = (...values: string[]) => values.map((of) => ({ label: titleCase(of), config: { of } }));

const CANDIDATES: Record<AddableKind, (names: string[]) => PanelChoice[]> = {
  camera: signalChoice(false, (signal) => ({ signal })),
  value: signalChoice(true, (signal) => ({ signal })),
  plot: signalChoice(true, (signal) => ({ signals: [signal] })),
  table: (names) => [
    ...ofChoices('servos', 'joints'),
    ...signalChoice(true, (signal) => ({ of: 'signals', signals: [signal] }))(names),
  ],
  button: () => CASE_ACTIONS.map((action) => ({ label: CASE_ACTION_LABELS[action], config: { action } })),
  list: () => ofChoices('tries', 'failures'),
  text: () => ofChoices('brief'),
  map: () => [{ label: kindLabel('map'), config: {} }],
};

const reads = (kind: PanelKind, config: Record<string, unknown>, scope: SignalScope) => {
  try {
    readPanelConfig(kind, config, 'panel', scope);

    return true;
  } catch {
    return false;
  }
};

export const panelChoices = (kind: AddableKind, names: string[], scope: SignalScope): PanelChoice[] =>
  CANDIDATES[kind](names).filter((choice) => reads(kind, choice.config, scope));

export function checkedConsole(kase: Case, edit: ConsoleEdit): Case | string {
  if (!edit.ok) return edit.problem;

  try {
    return parseCase({ ...kase, console: edit.console });
  } catch (e) {
    return errorMessage(e);
  }
}
