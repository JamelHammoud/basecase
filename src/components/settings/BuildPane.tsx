import React from 'react';
import { Switch } from '../../design-system';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

export interface BuildPrefs {
  autoGuide: boolean;
  setAutoGuide: (v: boolean) => void;
  autoFixBlockers: boolean;
  setAutoFixBlockers: (v: boolean) => void;
}

export const BuildPane: React.FC<{ prefs: BuildPrefs }> = ({ prefs }) => (
  <>
    <Group title="Build guide">
      <Row label="Auto generate build guide" hint="Updates 15 s after the scene changes, once the agent is done">
        <Switch aria-label="Auto generate build guide" checked={prefs.autoGuide} onChange={prefs.setAutoGuide} />
      </Row>
    </Group>
    <Group title="Build check">
      <Row
        label="Have the agent fix new blockers"
        hint="When a turn adds blockers, the agent gets up to 2 follow-ups to fix them"
      >
        <Switch
          aria-label="Have the agent fix new blockers"
          checked={prefs.autoFixBlockers}
          onChange={prefs.setAutoFixBlockers}
        />
      </Row>
    </Group>
  </>
);
