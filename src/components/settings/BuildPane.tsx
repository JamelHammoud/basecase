import React from 'react';
import { Switch } from '../../design-system';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

interface BuildPaneProps {
  autoGuide: boolean;
  onAutoGuide: (v: boolean) => void;
}

export const BuildPane: React.FC<BuildPaneProps> = ({ autoGuide, onAutoGuide }) => (
  <Group title="Build guide">
    <Row label="Auto generate build guide" hint="Updates 15 s after the scene changes, once the agent is done">
      <Switch checked={autoGuide} onChange={onAutoGuide} />
    </Row>
  </Group>
);
