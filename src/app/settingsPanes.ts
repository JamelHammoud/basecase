import { IS_WEB_DEMO } from '../utils/platform/webDemo';

export type SettingsPane = 'canvas' | 'agent' | 'build' | 'printers' | 'accounts' | 'shortcuts';

export type SettingsField = 'map-tiles';

const PANES: Array<{ id: SettingsPane; label: string; keywords: string }> = [
  { id: 'canvas', label: 'Canvas', keywords: 'grid snap trackpad scroll measure units imperial sculpt' },
  { id: 'agent', label: 'Agent', keywords: 'claude codex gemini offline command' },
  {
    id: 'build',
    label: 'Build',
    keywords: 'currency money price budget euro pound yen dollar region checks blockers guide',
  },
  { id: 'printers', label: 'Printers', keywords: 'printer bambu prusa slicer orcaslicer network' },
  { id: 'accounts', label: 'Accounts', keywords: 'hugging face onshape google maps tiles token key login' },
  { id: 'shortcuts', label: 'Shortcuts', keywords: 'keys keyboard hotkeys' },
];

const DESKTOP_PANES: SettingsPane[] = ['agent', 'printers', 'accounts'];

export const SETTINGS_PANES = IS_WEB_DEMO ? PANES.filter((p) => !DESKTOP_PANES.includes(p.id)) : PANES;

const SETTINGS_PATH = / in Settings ▸ (\p{L}+)/u;

export const settingsPaneIn = (message: string): SettingsPane | null => {
  const label = SETTINGS_PATH.exec(message)?.[1];

  return SETTINGS_PANES.find((p) => p.label === label)?.id ?? null;
};

export const withoutSettingsPath = (message: string) => message.replace(SETTINGS_PATH, '');
