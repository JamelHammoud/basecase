import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { pairNetworkRobot } from './networkPairClient.mjs';

const KEY = 'ab'.repeat(32);

function helper(output, status = 0) {
  const child = new EventEmitter();

  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  child.stdin.on('data', (data) => {
    child.input = String(data);
  });

  const spawnFn = vi.fn(() => {
    queueMicrotask(() => {
      child.stdout.write(output);
      child.emit('close', status);
    });

    return child;
  });

  return { child, spawnFn };
}

const OPTIONS = { binary: 'robot-daemon', address: '127.0.0.1', port: 7447, code: '123456' };

describe('network pairing helper', () => {
  it('sends only the pinned endpoint in argv and sends the code through stdin', async () => {
    const { child, spawnFn } = helper(JSON.stringify({ event: 'paired', key: KEY }));
    const pair = pairNetworkRobot({ ...OPTIONS, spawnFn });

    expect(await pair.key).toBe(KEY);
    expect(spawnFn).toHaveBeenCalledWith('robot-daemon', ['--pair-client', '127.0.0.1:7447'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    expect(JSON.parse(child.input)).toEqual({ code: '123456' });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('rejects oversized output, malformed keys and unsuccessful pairing without leaking output', async () => {
    for (const output of ['x'.repeat(5000), JSON.stringify({ event: 'paired', key: 'bad' }), 'private output', '{}']) {
      const { spawnFn } = helper(output);

      await expect(pairNetworkRobot({ ...OPTIONS, spawnFn }).key).rejects.toThrow('pairing code');
    }

    const { spawnFn } = helper(JSON.stringify({ event: 'paired', key: KEY }), 1);

    await expect(pairNetworkRobot({ ...OPTIONS, spawnFn }).key).rejects.toThrow('pairing code');
  });

  it('cancels a pending helper and brackets pinned IPv6 addresses', async () => {
    const { child } = helper('');
    const spawnFn = vi.fn(() => child);
    const pairing = pairNetworkRobot({ ...OPTIONS, address: '::1', spawnFn });

    pairing.cancel();
    await expect(pairing.key).rejects.toThrow('canceled');
    expect(child.kill).toHaveBeenCalledOnce();
    expect(spawnFn.mock.calls[0][1]).toEqual(['--pair-client', '[::1]:7447']);
  });
});
