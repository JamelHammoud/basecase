import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkSocket } from './networkSocket.mjs';

afterEach(() => vi.useRealTimers());

describe('network robot responsiveness', () => {
  it('keeps a responding robot connected and closes a silent peer even while heartbeats are being sent', () => {
    vi.useFakeTimers();

    const socket = new EventEmitter();
    const key = 'ab'.repeat(32);
    const nonce = 'cd'.repeat(32);
    const on = { ready: vi.fn(), line: vi.fn(), exit: vi.fn() };

    socket.setNoDelay = vi.fn();
    socket.setEncoding = vi.fn();
    socket.write = vi.fn();
    socket.destroy = vi.fn();
    socket.writable = true;
    socket.writableLength = 0;
    networkSocket({ key, on, connect: () => socket, address: '127.0.0.1', port: 7447 });
    socket.emit('data', `${JSON.stringify({ event: 'challenge', nonce })}\n`);

    const send = (seq, event) => {
      const body = JSON.stringify(event);
      const mac = createHmac('sha256', Buffer.from(key, 'hex')).update(`${nonce}:server:${seq}:${body}`).digest('hex');

      socket.emit('data', `${JSON.stringify({ seq, body, mac })}\n`);
    };

    send(1, { event: 'hello', spec: { family: 'feetech' } });
    vi.advanceTimersByTime(750);
    send(2, { event: 'status', mode: 'look' });
    vi.advanceTimersByTime(750);
    expect(on.exit).not.toHaveBeenCalled();
    expect(on.line).toHaveBeenCalledWith(JSON.stringify({ event: 'status', mode: 'look' }));
    expect(socket.write.mock.calls.some(([line]) => line.includes('heartbeat'))).toBe(true);
    vi.advanceTimersByTime(250);
    expect(on.exit).toHaveBeenCalledExactlyOnceWith('The robot connection stopped responding.');
    expect(socket.destroy).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(on.exit).toHaveBeenCalledOnce();
  });
});
