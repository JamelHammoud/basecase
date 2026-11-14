import { describe, expect, it } from 'vitest';
import type { AcpStatusInfo } from '../types/robotics';
import { connectingFrom, createReconnect, failedFrom } from './agentReconnect';

const connected: AcpStatusInfo = {
  connected: true,
  sessionId: 's1',
  agentName: 'Claude Code',
  agentCommand: 'claude',
  error: 'Rate limited',
};

function harness() {
  const calls: Array<{ command?: string; resolve: (status: AcpStatusInfo) => void; reject: () => void }> = [];
  let status = connected;

  const reconnect = createReconnect({
    connect: (command) =>
      new Promise((resolve, reject) => {
        calls.push({ command, resolve, reject: () => reject(new Error('offline')) });
      }),
    setStatus: (update) => {
      status = update(status);
    },
  });

  return { calls, reconnect, status: () => status };
}

describe('reconnecting the agent', () => {
  it('reads as connecting at once, without the old error', () => {
    expect(connectingFrom(connected)).toEqual({ ...connected, connected: false, connecting: true, error: undefined });
  });

  it('says it couldn’t reconnect when the request fails', async () => {
    const { calls, reconnect, status } = harness();
    const done = reconnect('claude');

    expect(status()).toMatchObject({ connected: false, connecting: true });
    calls[0].reject();
    await done;
    expect(status()).toEqual(failedFrom(connectingFrom(connected)));
    expect(status().error).toBe('Couldn’t reconnect to Claude Code.');
  });

  it('keeps the latest click’s answer when an earlier one arrives after it', async () => {
    const { calls, reconnect, status } = harness();
    const first = reconnect('codex');
    const second = reconnect('gemini');
    const gemini = { ...connected, agentName: 'Gemini', agentCommand: 'gemini', error: undefined };

    calls[1].resolve(gemini);
    await second;
    calls[0].resolve({ ...connected, agentName: 'Codex', agentCommand: 'codex' });
    await first;
    expect(calls.map((call) => call.command)).toEqual(['codex', 'gemini']);
    expect(status()).toEqual(gemini);
  });

  it('ignores an earlier click’s failure once a later one answered', async () => {
    const { calls, reconnect, status } = harness();
    const first = reconnect();
    const second = reconnect();

    calls[1].resolve(connected);
    await second;
    calls[0].reject();
    await first;
    expect(status()).toEqual(connected);
  });
});
