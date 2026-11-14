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
import { isDiagnosticTopic } from '../../topics/diagnostics';
import { isLogTopic } from '../../topics/logs';
import { topicRef, type TopicIndex } from '../../topics/topicIndex';
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

export function busNames(bus: Pick<SignalBus, 'expand' | 'listed'>, inputs: readonly string[]): string[] {
  const patterns = [
    '*',
    ...WILDCARDS,
    'robot.*',
    'probe.*',
    'goal.*',
    'gesture.*',
    ...inputs.map((s) => `input.${s}.*`),
  ];

  return [...new Set([...WILDCARDS, ...patterns.flatMap((p) => bus.expand(p)), ...(bus.listed?.() ?? [])])];
}

const SIGNAL_DRAFTS: Partial<Record<PanelKind, (signal: string) => PanelDraft>> = {
  camera: (signal) => ({ kind: 'camera', signal }),
  value: (signal) => ({ kind: 'value', signal }),
  plot: (signal) => ({ kind: 'plot', signals: [signal] }),
  table: (signal) => ({ kind: 'table', of: 'signals', signals: [signal] }),
  states: (signal) => ({ kind: 'states', signal }),
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

const TOPIC_OPTIONS: Partial<Record<PanelKind, (topics: TopicIndex) => PanelChoice[]>> = {
  log: (topics) => (topics.topics.some(isLogTopic) ? [option('log', 'log')] : []),
  diagnostics: (topics) => (topics.topics.some(isDiagnosticTopic) ? [option('diagnostics', 'diagnostics')] : []),
  message: (topics) =>
    topics.topics.map((t) => ({ label: topicRef(t.topic), draft: { kind: 'message', topic: topicRef(t.topic) } })),
};

export function panelChoices(
  kind: PanelKind,
  names: readonly string[],
  scope: SignalScope,
  topics: TopicIndex | null = null,
): PanelChoice[] {
  const toDraft = SIGNAL_DRAFTS[kind];
  const drawn = kind === 'plot' && topics ? names.filter((name) => !topics.labels(name)) : names;
  const signals = toDraft ? drawn.map((name) => ({ label: name, draft: toDraft(name) })) : [];
  const fromTopics = topics ? (TOPIC_OPTIONS[kind]?.(topics) ?? []) : [];

  return [...signals, ...(OPTIONS[kind] ?? []), ...fromTopics].filter((c) => fits(c.draft, scope));
}
