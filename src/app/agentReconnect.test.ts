import { describe, expect, it } from 'vitest';
import type { AcpStatusInfo } from '../types/robotics';
import { connectingFrom, failedFrom } from './useAgentConnection';

const connected: AcpStatusInfo = {
  connected: true,
  sessionId: 's1',
  agentName: 'Claude Code',
  agentCommand: 'claude',
  error: 'Rate limited',
};

describe('reconnecting the agent', () => {
  it('reads as connecting at once, without the old error', () => {
    expect(connectingFrom(connected)).toEqual({ ...connected, connected: false, connecting: true, error: undefined });
  });

  it('says it couldn’t reconnect when the request fails', () => {
    expect(failedFrom(connectingFrom(connected))).toMatchObject({
      connected: false,
      connecting: false,
      error: 'Couldn’t reconnect to Claude Code.',
    });
  });
});
