import type { AcpStatusInfo } from '../types/robotics';

type StatusUpdate = (update: (status: AcpStatusInfo) => AcpStatusInfo) => void;

export interface ReconnectDeps {
  connect: (command?: string) => Promise<AcpStatusInfo>;
  setStatus: StatusUpdate;
}

export const connectingFrom = (status: AcpStatusInfo): AcpStatusInfo => ({
  ...status,
  connected: false,
  connecting: true,
  error: undefined,
});

export const failedFrom = (status: AcpStatusInfo): AcpStatusInfo => ({
  ...status,
  connected: false,
  connecting: false,
  error: `Couldn’t reconnect to ${status.agentName}.`,
});

export function createReconnect({ connect, setStatus }: ReconnectDeps) {
  let attempts = 0;

  return async (command?: string) => {
    const attempt = ++attempts;
    const latest = () => attempt === attempts;

    setStatus(connectingFrom);

    try {
      const status = await connect(command);

      if (latest()) setStatus(() => status);
    } catch {
      if (latest()) setStatus(failedFrom);
    }
  };
}
