import type { PanelDraft } from '../../cases/console/consoleEdits';
import {
  CASE_ACTIONS,
  PANEL_KIND_NAMES,
  readPanelConfig,
  type PanelKind,
  type PanelSpec,
} from '../../cases/console/panelKinds';
import type { SignalBus } from '../../cases/console/signalBus';
import { JOINT_FIELDS, type SignalScope } from '../../cases/console/signalNames';
import { BUTTON_LABELS } from './panels/buttonLabels';

export interface PanelChoice {
  label: string;
  draft: PanelDraft;
}

export const ADDABLE_KINDS = PANEL_KIND_NAMES.filter((k) => k !== 'code');

const capitalized = (word: string) => word[0].toUpperCase() + word.slice(1);

export const kindLabel = (kind: PanelKind) => capitalized(kind);

export const panelLabel = (panel: PanelSpec) => panel.title ?? kindLabel(panel.kind);

const WILDCARDS = [...JOINT_FIELDS.map((f) => `joint.*.${f}`), 'camera.*'];

export function busNames(bus: Pick<SignalBus, 'expand'>, inputs: readonly string[]): string[] {
  const patterns = [
    '*',
    ...WILDCARDS,
    'robot.*',
    'probe.*',
    'goal.*',
    'gesture.*',
    ...inputs.map((s) => `input.${s}.*`),
  ];

  return [...new Set([...WILDCARDS, ...patterns.flatMap((p) => bus.expand(p))])];
}

const SIGNAL_DRAFTS: Partial<Record<PanelKind, (signal: string) => PanelDraft>> = {
  camera: (signal) => ({ kind: 'camera', signal }),
  value: (signal) => ({ kind: 'value', signal }),
  plot: (signal) => ({ kind: 'plot', signals: [signal] }),
  table: (signal) => ({ kind: 'table', of: 'signals', signals: [signal] }),
};

const option = (kind: PanelKind, label: string, config: Record<string, unknown> = {}): PanelChoice => ({
  label: capitalized(label),
  draft: { kind, ...config },
});

const OPTIONS: Partial<Record<PanelKind, PanelChoice[]>> = {
  table: ['servos', 'joints'].map((of) => option('table', of, { of })),
  button: CASE_ACTIONS.map((action) => option('button', BUTTON_LABELS[action], { action })),
  list: ['tries', 'failures'].map((of) => option('list', of, { of })),
  text: [option('text', 'brief', { of: 'brief' })],
  map: [option('map', 'map')],
};

const fits = ({ kind, ...config }: PanelDraft, scope: SignalScope) => {
  try {
    readPanelConfig(kind, config, 'panel', scope);

    return true;
  } catch {
    return false;
  }
};

export function panelChoices(kind: PanelKind, names: readonly string[], scope: SignalScope): PanelChoice[] {
  const toDraft = SIGNAL_DRAFTS[kind];
  const signals = toDraft ? names.map((name) => ({ label: name, draft: toDraft(name) })) : [];

  return [...signals, ...(OPTIONS[kind] ?? [])].filter((c) => fits(c.draft, scope));
}
