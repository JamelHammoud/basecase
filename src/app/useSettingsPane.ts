import { useState } from 'react';
import type { SettingsField, SettingsPane } from './settingsPanes';

interface SettingsState {
  open: SettingsPane | null;
  last: SettingsPane;
  field?: SettingsField;
}

function withOpen(state: SettingsState, open: SettingsPane | null): SettingsState {
  return state.open === open ? state : { ...state, open };
}

export function useSettingsPane() {
  const [settings, setSettings] = useState<SettingsState>({ open: null, last: 'canvas' });

  const openSettings = (pane?: SettingsPane, field?: SettingsField) =>
    setSettings((s) => ({ ...withOpen(s, pane ?? s.last), field }));
  const changePane = (pane: SettingsPane) => setSettings({ open: pane, last: pane });
  const closeSettings = () => setSettings((s) => withOpen(s, null));

  return {
    settingsOpen: settings.open !== null,
    pane: settings.open ?? settings.last,
    field: settings.field,
    openSettings,
    changePane,
    closeSettings,
  };
}
