import React, { useState } from 'react';
import { AcpStatusInfo } from '../../types/robotics';
import { AGENT_PROFILES } from '../../agent/agentKinds';
import { IconButton, RefreshIcon, SegmentedControl, TextInput } from '../../design-system';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

export interface AgentPaneProps {
  acpStatus: AcpStatusInfo;
  onReconnectAcp: (command?: string) => Promise<void>;
}

const agentOfCommand = (command: string) => AGENT_PROFILES.find((p) => p.command === command);

function agentStatusText(status: AcpStatusInfo) {
  if (status.connecting) return 'Connecting…';

  if (status.connected && status.signIn) return `Sign in to ${status.agentName} from the Agent tab`;

  return status.connected ? `Connected to ${status.agentName}` : status.error || 'Not connected';
}

export const AgentPane: React.FC<AgentPaneProps> = (p) => {
  const [command, setCommand] = useState(p.acpStatus.agentCommand);
  const agent = agentOfCommand(command);

  return (
    <Group>
      <Row label="Run with" hint={agent?.hint ?? 'Custom ACP agent'}>
        <SegmentedControl<string>
          className="w-[320px]"
          aria-label="Run with"
          value={agent?.kind ?? ''}
          onChange={(kind) => {
            const cmd = AGENT_PROFILES.find((profile) => profile.kind === kind)?.command;

            if (!cmd) return;

            setCommand(cmd);
            p.onReconnectAcp(cmd);
          }}
          options={AGENT_PROFILES.map((profile) => ({ value: profile.kind, label: profile.label }))}
        />
      </Row>
      <Row
        stacked
        label="Command"
        hint={
          <span
            className={`break-words ${p.acpStatus.connecting || (p.acpStatus.connected && !p.acpStatus.signIn) ? '' : 'text-amber-400'}`}
          >
            {agentStatusText(p.acpStatus)}
          </span>
        }
      >
        <div className="flex gap-[6px]">
          <TextInput
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') p.onReconnectAcp(command);
            }}
            aria-label="Command"
            className="font-mono text-[12px]"
          />
          <IconButton
            icon={<RefreshIcon className="w-3.5 h-3.5" />}
            title="Reconnect"
            onClick={() => p.onReconnectAcp(command)}
          />
        </div>
      </Row>
    </Group>
  );
};
