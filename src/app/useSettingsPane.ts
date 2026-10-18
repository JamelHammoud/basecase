import { useState } from 'react';
import type { SettingsPane } from '../components/SettingsWindow';

interface SettingsState {
  open: SettingsPane | null;
  last: SettingsPane;
}

function withOpen(state: SettingsState, open: SettingsPane | null): SettingsState {
  return state.open === open ? state : { ...state, open };
}

export function useSettingsPane() {
  const [settings, setSettings] = useState<SettingsState>({ open: null, last: 'canvas' });

  const openSettings = (pane?: SettingsPane) => setSettings((s) => withOpen(s, pane ?? s.last));
  const changePane = (pane: SettingsPane) => setSettings({ open: pane, last: pane });
  const closeSettings = () => setSettings((s) => withOpen(s, null));

  return {
    settingsOpen: settings.open !== null,
    pane: settings.open ?? settings.last,
    openSettings,
    changePane,
    closeSettings,
  };
}
