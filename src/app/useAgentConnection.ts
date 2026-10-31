import { useEffect, useState } from 'react';
import type { AcpStatusInfo, AgentChoice, AgentKind } from '../types/robotics';
import { agentKindOf } from '../agent/agentKinds';
import { platformBridge } from '../utils/platformBridge';
import { readStored, writeStored } from './storedSettings';

const OFFLINE_STATUS: AcpStatusInfo = {
  connected: false,
  sessionId: null,
  agentName: 'Basecase Offline Agent',
  agentCommand: 'node electron/acp-3d-agent.mjs',
};

const STARTING_STATUS: AcpStatusInfo = { ...OFFLINE_STATUS, connecting: true };

type AgentChoices = Partial<Record<AgentKind, AgentChoice>>;

const NO_CHOICE: AgentChoice = {};

const optionalString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

const cleanChoice = (saved: unknown): AgentChoice => {
  const choice = saved as Partial<AgentChoice> | null;

  return { model: optionalString(choice?.model), effort: optionalString(choice?.effort) };
};

const loadAgentChoices = (): AgentChoices => {
  const saved = readStored('agent-choices');

  if (saved && typeof saved === 'object') {
    return Object.fromEntries(Object.entries(saved).map(([kind, choice]) => [kind, cleanChoice(choice)]));
  }

  const legacy = readStored('agent-choice');

  return legacy ? { claude: cleanChoice(legacy) } : {};
};

export function useAgentConnection() {
  const [acpStatus, setAcpStatus] = useState<AcpStatusInfo>(STARTING_STATUS);
  const [agentTargetHeightMm, setAgentTargetHeightMm] = useState(0);
  const [agentChoices, setAgentChoices] = useState(loadAgentChoices);
  const kind = agentKindOf(acpStatus);
  const agentChoice = agentChoices[kind] ?? NO_CHOICE;

  const setAgentChoice = (choice: AgentChoice) => setAgentChoices((all) => ({ ...all, [kind]: choice }));

  const reconnectAcp = async (command?: string) => {
    setAcpStatus(await platformBridge.connectAcp(command));
  };

  const signInAcp = async (methodId: string) => {
    setAcpStatus(await platformBridge.authenticateAcp(methodId));
  };

  const saveAgentApiKey = async (key: string) => {
    setAcpStatus(await platformBridge.setAgentApiKey(key));
  };

  useEffect(() => {
    platformBridge
      .getAcpStatus()
      .then(setAcpStatus)
      .catch(() => setAcpStatus(OFFLINE_STATUS));
  }, []);

  useEffect(() => {
    writeStored('agent-choices', agentChoices);
  }, [agentChoices]);

  return {
    acpStatus,
    setAcpStatus,
    reconnectAcp,
    signInAcp,
    saveAgentApiKey,
    agentTargetHeightMm,
    setAgentTargetHeightMm,
    agentChoice,
    setAgentChoice,
  };
}
