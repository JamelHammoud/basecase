import { hasInputSource, NAMED_INPUTS } from '../../sim/inputSources';
import { gestureNames, type CaseGesture } from '../gestures';
import { asId, asNumber, asRecord, asString, listOf, oneOf, optional, refuse, type Reader } from '../validate';
import { PANEL_KIND_NAMES, readPanelConfig, type PanelSpec } from './panelKinds';
import { NAMESPACES, signalRef, type SignalScope } from './signalNames';

export type ConsoleSignal =
  | { id: string; kind: 'timer'; seconds?: number }
  | { id: string; kind: 'counter'; when: { signal: string; above?: number; below?: number } }
  | { id: string; kind: 'score'; sum: Array<{ signal: string; times: number }> };

export const OVERLAY_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'fill',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

export type OverlayAnchor = (typeof OVERLAY_ANCHORS)[number];

export interface CanvasOverlay {
  panel: string;
  anchor: OverlayAnchor;
  width?: number;
  height?: number;
  pointer?: boolean;
}

export type ConsoleArea = { canvas: true; overlays?: CanvasOverlay[] } | { size: number; panels: string[] };

export interface CaseConsole {
  input: string[];
  signals?: ConsoleSignal[];
  panels: PanelSpec[];
  layout: { areas: ConsoleArea[] };
}

const MAX_PANELS = 24;

export const MAX_CODE_PANELS = 4;

const OVERLAY_MIN = 40;
const OVERLAY_MAX = 1600;

export const AREA_MIN = 200;
export const AREA_MAX = 720;

const unique = <T>(items: T[], key: (item: T) => string, where: string) => {
  const seen = new Set<string>();

  items.forEach((item, i) => {
    const k = key(item);

    if (seen.has(k)) refuse(`${where}[${i}]`, `repeats ${k}`);

    seen.add(k);
  });

  return items;
};

const readInput: Reader<string> = (value, where) => {
  const id = asId(value, where);

  if (hasInputSource(id)) return id;

  if ((NAMED_INPUTS as readonly string[]).includes(id))
    return refuse(where, `${id} can’t drive a Case in this version`);

  return refuse(where, `${id} is no input source`);
};

const signalId: Reader<string> = (value, where) => {
  const id = asId(value, where);

  if (!/^[a-z][\w-]*$/i.test(id) || (NAMESPACES as readonly string[]).includes(id))
    return refuse(where, 'must be a plain name without dots');

  return id;
};

function readSignal(value: unknown, where: string, scope: SignalScope): ConsoleSignal {
  const v = asRecord(value, where);
  const id = signalId(v.id, `${where}.id`);
  const k = oneOf(['timer', 'counter', 'score'] as const)(v.kind, `${where}.kind`);
  const ref = signalRef(scope, ['number']);

  if (k === 'timer') {
    const seconds = optional(asNumber, v.seconds, `${where}.seconds`);

    return seconds === undefined ? { id, kind: k } : { id, kind: k, seconds };
  }

  if (k === 'score') {
    const sum = listOf((term, at) => {
      const t = asRecord(term, at);

      return { signal: ref(t.signal, `${at}.signal`), times: asNumber(t.times, `${at}.times`) };
    }, 16)(v.sum, `${where}.sum`);

    return { id, kind: k, sum };
  }

  const when = asRecord(v.when, `${where}.when`);
  const above = optional(asNumber, when.above, `${where}.when.above`);
  const below = optional(asNumber, when.below, `${where}.when.below`);

  if (above === undefined && below === undefined) refuse(`${where}.when`, 'needs above or below');

  return {
    id,
    kind: k,
    when: {
      signal: ref(when.signal, `${where}.when.signal`),
      ...(above === undefined ? {} : { above }),
      ...(below === undefined ? {} : { below }),
    },
  };
}

function readSignals(value: unknown, where: string, scope: SignalScope): ConsoleSignal[] {
  const list = listOf((s) => s, 32)(value, where);
  const declared = new Set<string>();

  return list.map((item, i) => {
    const signal = readSignal(item, `${where}[${i}]`, { ...scope, declared });

    if (declared.has(signal.id)) refuse(`${where}[${i}]`, `repeats ${signal.id}`);

    declared.add(signal.id);

    return signal;
  });
}

function readPanel(value: unknown, where: string, scope: SignalScope): PanelSpec {
  const v = asRecord(value, where);
  const id = asId(v.id, `${where}.id`);
  const k = oneOf(PANEL_KIND_NAMES)(v.kind, `${where}.kind`);
  const title = optional(asString, v.title, `${where}.title`);
  const config = readPanelConfig(k, v, where, scope);

  return { id, kind: k, ...(title === undefined ? {} : { title }), ...config } as PanelSpec;
}

const overlaySide = (value: unknown, where: string, needed: boolean) => {
  if (value === undefined) return needed ? refuse(where, 'is needed for this anchor') : undefined;

  const n = asNumber(value, where);

  return n >= OVERLAY_MIN && n <= OVERLAY_MAX ? n : refuse(where, `must be from ${OVERLAY_MIN} to ${OVERLAY_MAX}`);
};

const readOverlay: Reader<CanvasOverlay> = (value, where) => {
  const v = asRecord(value, where);
  const panel = asId(v.panel, `${where}.panel`);
  const anchor = oneOf(OVERLAY_ANCHORS)(v.anchor, `${where}.anchor`);
  const across = anchor === 'top' || anchor === 'bottom';
  const down = anchor === 'left' || anchor === 'right';
  const width = overlaySide(v.width, `${where}.width`, anchor !== 'fill' && !across);
  const height = overlaySide(v.height, `${where}.height`, anchor !== 'fill' && !down);

  if (v.pointer !== undefined && typeof v.pointer !== 'boolean') refuse(`${where}.pointer`, 'must be true or false');

  return {
    panel,
    anchor,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(v.pointer === true ? { pointer: true } : {}),
  };
};

const readArea: Reader<ConsoleArea> = (value, where) => {
  const v = asRecord(value, where);

  if (v.canvas === true) {
    const overlays = optional(listOf(readOverlay, MAX_CODE_PANELS), v.overlays, `${where}.overlays`);

    return overlays ? { canvas: true, overlays } : { canvas: true };
  }

  const size = asNumber(v.size, `${where}.size`);

  if (size < AREA_MIN || size > AREA_MAX) refuse(`${where}.size`, `must be from ${AREA_MIN} to ${AREA_MAX}`);

  const panels = listOf(asId, 12)(v.panels, `${where}.panels`);

  if (!panels.length) refuse(`${where}.panels`, 'must name a panel');

  return { size, panels };
};

function readLayout(value: unknown, where: string, panels: PanelSpec[]) {
  const v = asRecord(value, where);
  const areas = listOf(readArea, 6)(v.areas, `${where}.areas`);

  if (areas.filter((a) => 'canvas' in a).length !== 1) refuse(`${where}.areas`, 'must hold the canvas once');

  const kinds = new Map(panels.map((p) => [p.id, p.kind]));

  areas.forEach((a, i) =>
    ('overlays' in a ? (a.overlays ?? []) : []).forEach((o, j) => {
      if (kinds.has(o.panel) && kinds.get(o.panel) !== 'code')
        refuse(`${where}.areas[${i}].overlays[${j}].panel`, `${o.panel} isn’t a code panel`);
    }),
  );

  const placed = areas.flatMap((a) => ('panels' in a ? a.panels : (a.overlays ?? []).map((o) => o.panel)));
  const ids = new Set(kinds.keys());

  placed.forEach((id) => {
    if (!ids.has(id)) refuse(`${where}.areas`, `places ${id}, which no panel is`);
  });
  unique(placed, (id) => id, `${where}.areas.panels`);
  panels.forEach((p) => {
    if (!placed.includes(p.id)) refuse(`${where}.areas`, `leaves out ${p.id}`);
  });

  return { areas };
}

interface ScopedCase {
  task: { probes: ReadonlyArray<{ signal: string }> };
  gestures?: readonly CaseGesture[];
}

export const consoleScope = (caseConsole: CaseConsole, kase: ScopedCase | null): SignalScope => ({
  declared: new Set(caseConsole.signals?.map((s) => s.id)),
  probes: new Set(kase?.task.probes.map((p) => p.signal)),
  inputs: new Set(caseConsole.input),
  gestures: new Set(gestureNames(kase?.gestures)),
});

export interface ConsoleNames {
  probes: readonly string[];
  gestures?: readonly string[];
}

export const consoleReader =
  ({ probes, gestures }: ConsoleNames): Reader<CaseConsole> =>
  (value, where) => {
    const v = asRecord(value, where);
    const input = unique(listOf(readInput, 4)(v.input, `${where}.input`), (id) => id, `${where}.input`);

    if (!input.length) refuse(`${where}.input`, 'must name an input source');

    const base: SignalScope = {
      declared: new Set(),
      probes: new Set(probes),
      inputs: new Set(input),
      ...(gestures ? { gestures: new Set(gestures) } : {}),
    };
    const signals = v.signals === undefined ? undefined : readSignals(v.signals, `${where}.signals`, base);
    const scope = { ...base, declared: new Set(signals?.map((s) => s.id)) };
    const panels = unique(
      listOf((p, at) => readPanel(p, at, scope), MAX_PANELS)(v.panels, `${where}.panels`),
      (p) => p.id,
      `${where}.panels`,
    );

    const fifth = panels.filter((p) => p.kind === 'code')[MAX_CODE_PANELS];

    if (fifth) refuse(`${where}.panels[${panels.indexOf(fifth)}]`, 'is a fifth code panel; a Case runs at most 4');

    return {
      input,
      ...(signals ? { signals } : {}),
      panels,
      layout: readLayout(v.layout, `${where}.layout`, panels),
    };
  };
