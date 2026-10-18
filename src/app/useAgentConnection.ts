import { useEffect, useState } from 'react';
import type { AcpStatusInfo } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';

const OFFLINE_STATUS: AcpStatusInfo = {
  connected: false,
  sessionId: null,
  agentName: 'Basecase Offline Agent',
  agentCommand: 'node electron/acp-3d-agent.mjs',
};

export function useAgentConnection() {
  const [acpStatus, setAcpStatus] = useState<AcpStatusInfo>(OFFLINE_STATUS);
  const [agentTargetHeightMm, setAgentTargetHeightMm] = useState(0);

  const reconnectAcp = async (command?: string) => {
    setAcpStatus(await platformBridge.connectAcp(command));
  };

  useEffect(() => {
    platformBridge
      .getAcpStatus()
      .then(setAcpStatus)
      .catch(() => {});
  }, []);

  return { acpStatus, setAcpStatus, reconnectAcp, agentTargetHeightMm, setAgentTargetHeightMm };
}
