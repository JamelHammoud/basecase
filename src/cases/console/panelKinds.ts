import { fileSize, KB } from '../../../electron/fileSize.mjs';
import { asNumber, asString, listOf, oneOf, optional, refuse, type Reader } from '../validate';
import { JOINT_FIELDS, signalRef, signalShape, type JointField, type SignalScope } from './signalNames';

export const CASE_ACTIONS = ['try', 'end-try', 'drive', 'stop', 'start-over', 'reset'] as const;

export type CaseAction = (typeof CASE_ACTIONS)[number];

type Config = Record<string, unknown>;

interface PanelKindSpec<C extends Config> {
  read: (v: Config, where: string, scope: SignalScope) => C;
  desktopOnly?: (config: C) => boolean;
  studioOnly?: (config: C) => boolean;
}

const kind = <C extends Config>(spec: PanelKindSpec<C>) => spec;

const between = (min: number, max: number): Reader<number> => {
  return (value, where) => {
    const n = asNumber(value, where);

    return n >= min && n <= max ? n : refuse(where, `must be from ${min} to ${max}`);
  };
};

const numbers = (scope: SignalScope, many = false) => signalRef(scope, ['number'], many);

const readTable = (v: Config, where: string, scope: SignalScope) => {
  const of = oneOf(['servos', 'joints', 'signals'] as const)(v.of, `${where}.of`);

  if (of === 'signals') return { of, signals: listOf(numbers(scope, true), 24)(v.signals, `${where}.signals`) };

  if (of === 'servos') return { of };

  const columns = optional(listOf(oneOf(JOINT_FIELDS), 3), v.columns, `${where}.columns`);

  return columns ? { of, columns: columns as JointField[] } : { of };
};

export const CODE_SOURCE_MAX_BYTES = 256 * KB;

const readSource: Reader<string> = (value, where) => {
  if (typeof value !== 'string' || !value.trim()) return refuse(where, 'must be an HTML document');

  if (new TextEncoder().encode(value).length > CODE_SOURCE_MAX_BYTES)
    return refuse(where, `must be at most ${fileSize(CODE_SOURCE_MAX_BYTES)}`);

  return value;
};

const readCode = (v: Config, where: string) => {
  const source = readSource(v.source, `${where}.source`);
  const height = optional(between(80, 900), v.height, `${where}.height`);

  return height === undefined ? { source } : { source, height };
};

const readButton = (v: Config, where: string, scope: SignalScope): { action: CaseAction; gesture?: string } => {
  const action = oneOf(CASE_ACTIONS)(v.action, `${where}.action`);

  if (v.gesture === undefined) return { action };

  const gesture = asString(v.gesture, `${where}.gesture`);
  const shape = signalShape(`gesture.${gesture}`, scope);

  return shape === 'number' ? { action, gesture } : refuse(`${where}.gesture`, `${gesture} ${shape}`);
};

const readText = (v: Config, where: string) =>
  v.of === undefined
    ? { text: asString(v.text, `${where}.text`) }
    : { of: oneOf(['brief'] as const)(v.of, `${where}.of`) };

export const PANEL_KINDS = {
  camera: kind({
    read: (v, where, scope) => ({ signal: signalRef(scope, ['camera'], true)(v.signal, `${where}.signal`) }),
    studioOnly: () => true,
  }),
  value: kind({ read: (v, where, scope) => ({ signal: numbers(scope)(v.signal, `${where}.signal`) }) }),
  plot: kind({
    read: (v, where, scope) => {
      const seconds = optional(between(2, 120), v.seconds, `${where}.seconds`);
      const signals = listOf(numbers(scope, true), 8)(v.signals, `${where}.signals`);

      if (!signals.length) refuse(`${where}.signals`, 'must name a signal');

      return seconds === undefined ? { signals } : { signals, seconds };
    },
  }),
  table: kind({ read: readTable, desktopOnly: (c) => c.of === 'servos' }),
  button: kind({ read: readButton }),
  list: kind({
    read: (v, where) => ({ of: oneOf(['tries', 'failures'] as const)(v.of, `${where}.of`) }),
    studioOnly: (c) => c.of === 'tries',
  }),
  text: kind({ read: readText }),
  map: kind({
    read: (v, where) => {
      const trail = optional(between(0, 120), v.trail, `${where}.trail`);

      return trail === undefined ? {} : { trail };
    },
  }),
  code: kind({ read: readCode }),
};

export type PanelKind = keyof typeof PANEL_KINDS;

export const PANEL_KIND_NAMES = Object.keys(PANEL_KINDS) as PanelKind[];

export type PanelConfig<K extends PanelKind> = ReturnType<(typeof PANEL_KINDS)[K]['read']>;

export type PanelOf<K extends PanelKind> = { id: string; kind: K; title?: string } & PanelConfig<K>;

export type PanelSpec = { [K in PanelKind]: PanelOf<K> }[PanelKind];

export const readPanelConfig = (k: PanelKind, v: Config, where: string, scope: SignalScope) =>
  (PANEL_KINDS[k].read as PanelKindSpec<Config>['read'])(v, where, scope);

export interface PanelSurface {
  desktop: boolean;
  studio: boolean;
}

export function panelShows(panel: PanelSpec, { desktop, studio }: PanelSurface) {
  const spec = PANEL_KINDS[panel.kind] as PanelKindSpec<Config>;
  const config = panel as unknown as Config;

  return (desktop || !spec.desktopOnly?.(config)) && (studio || !spec.studioOnly?.(config));
}

export const gestureActions = (panels: readonly PanelSpec[], gesture: string): CaseAction[] =>
  panels.flatMap((p) => (p.kind === 'button' && p.gesture === gesture ? [p.action] : []));
