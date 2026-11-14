import type { CaseAction, PanelKind, PanelOf, PanelSpec } from './panelKinds';

export const ACTION_LABELS: Record<CaseAction, string> = {
  try: 'Try It',
  'end-try': 'Stop Try',
  drive: 'Drive',
  stop: 'Stop Driving',
  'start-over': 'Start Over',
  reset: 'Reset',
};

const NAME_MAX = 32;

export const kindName = (kind: PanelKind) => kind[0].toUpperCase() + kind.slice(1);

const shortened = (text: string) => {
  const line = text.trim().split('\n')[0];

  return line.length > NAME_MAX ? `${line.slice(0, NAME_MAX - 1).trimEnd()}…` : line;
};

const tableName = (panel: PanelOf<'table'>) => {
  if (panel.of === 'servos') return 'Servos';

  if (panel.of === 'joints') return 'Joints';

  return panel.signals.join(', ');
};

const SHOWS: { [K in PanelKind]: (panel: PanelOf<K>) => string } = {
  camera: (p) => (p.signal === 'camera.*' ? 'Cameras' : p.signal.slice('camera.'.length)),
  value: (p) => p.signal,
  plot: (p) => p.signals.join(', '),
  table: tableName,
  button: (p) => ACTION_LABELS[p.action],
  list: (p) => (p.of === 'tries' ? 'Results' : 'Failures'),
  text: (p) => ('of' in p ? 'Brief' : shortened(p.text)),
  map: () => 'Map',
  code: () => 'Code panel',
};

export const shownName = (panel: PanelSpec) => (SHOWS[panel.kind] as (p: PanelSpec) => string)(panel);

export const panelName = (panel: PanelSpec) => panel.title || shownName(panel);

const HEADED_KINDS: ReadonlySet<PanelKind> = new Set(['value', 'plot']);

export const headed = (kind: PanelKind) => HEADED_KINDS.has(kind);
