import http from 'node:http';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AgentBridge } from './backend/agentBridge.mjs';
import { AGENT_BODY_BYTES, bridgeBodyLimit } from './bridgeBodyLimits.mjs';
import { readBridgeBody } from './readBridgeBody.mjs';

function exchange(limit = 8) {
  const req = Object.assign(new EventEmitter(), { headers: {}, pause: vi.fn() });
  const res = { setHeader: vi.fn(), end: vi.fn(), statusCode: 200 };
  const onBody = vi.fn();

  readBridgeBody({ req, res, limit, onBody });

  return { req, res, onBody };
}

describe('bounded bridge body reader', () => {
  it('decodes split UTF-8 once and includes every byte at the boundary', () => {
    const { req, res, onBody } = exchange(4);
    const bytes = Buffer.from('界x');

    req.emit('data', bytes.subarray(0, 1));
    req.emit('data', bytes.subarray(1));
    req.emit('end');

    expect(onBody).toHaveBeenCalledExactlyOnceWith('界x');
    expect(res.end).not.toHaveBeenCalled();
  });

  it('stops at the first excessive chunk and never dispatches after later data or end', () => {
    const { req, res, onBody } = exchange();

    req.emit('data', Buffer.from('12345678'));
    req.emit('data', Buffer.from('9'));
    req.emit('data', Buffer.from('ignored'));
    req.emit('end');

    expect(res.statusCode).toBe(413);
    expect(res.end).toHaveBeenCalledExactlyOnceWith('{"error":"Send a smaller request"}');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(req.pause).toHaveBeenCalledOnce();
    expect(req.listenerCount('data')).toBe(0);
    expect(onBody).not.toHaveBeenCalled();
  });

  it.each(['error', 'aborted'])('does not dispatch an incomplete body after %s', (event) => {
    const { req, onBody } = exchange();

    req.emit('data', Buffer.from('123'));
    req.emit(event, new Error('stopped'));
    req.emit('end');

    expect(onBody).not.toHaveBeenCalled();
    expect(req.listenerCount('data')).toBe(0);
  });

  it.each([true, false])(
    'delivers JSON 413 over HTTP before the sender finishes, declared length: %s',
    async (declared) => {
      const onBody = vi.fn();
      const server = http.createServer((req, res) => readBridgeBody({ req, res, limit: 8, onBody }));

      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

      try {
        const response = await new Promise((resolve, reject) => {
          const req = http.request(
            {
              host: '127.0.0.1',
              port: server.address().port,
              method: 'POST',
              headers: declared ? { 'Content-Length': 9 } : {},
            },
            (res) => {
              let body = '';

              res.on('data', (chunk) => {
                body += chunk;
              });
              res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
            },
          );

          req.on('error', reject);
          req.write(declared ? '1' : '123456789');
        });

        expect(response).toEqual({ status: 413, type: 'application/json', body: '{"error":"Send a smaller request"}' });
        expect(onBody).not.toHaveBeenCalled();
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );

  it('counts agent bytes and answers without destroying the request or invoking a handler', () => {
    const bridge = new AgentBridge({ events: {}, onError: vi.fn() });
    const handler = vi.fn();
    const req = Object.assign(new EventEmitter(), {
      headers: {},
      method: 'POST',
      url: `/${bridge.token}/agent/apply`,
      pause: vi.fn(),
      destroy: vi.fn(),
    });
    const res = { setHeader: vi.fn(), end: vi.fn(), statusCode: 200 };
    const chunk = Buffer.from('界'.repeat(1000000));

    bridge.serve('apply', handler);
    bridge.handle(req, res);

    for (let bytes = 0; bytes <= AGENT_BODY_BYTES; bytes += chunk.length) req.emit('data', chunk);

    req.emit('end');

    expect(res.statusCode).toBe(413);
    expect(res.end).toHaveBeenCalledExactlyOnceWith('{"error":"Send a smaller request"}');
    expect(handler).not.toHaveBeenCalled();
    expect(req.destroy).not.toHaveBeenCalled();
  });

  it('assigns bounded budgets to data families and keeps training and electrical caps', () => {
    const mb = 1024 * 1024;

    expect(bridgeBodyLimit('/acp-connect')).toBe(mb);
    expect(bridgeBodyLimit('/upload-image')).toBe(2 * mb);
    expect(bridgeBodyLimit('/save-model')).toBe(36 * mb);
    expect(bridgeBodyLimit('/save-scene?autosave=1')).toBe(256 * mb);
    expect(bridgeBodyLimit('/cad-open')).toBe(4 * Math.ceil((200 * mb) / 3) + 65536);
    expect(bridgeBodyLimit('/vision-training-start')).toBe(24 * mb);
    expect(bridgeBodyLimit('/electrical-route')).toBe(24 * mb);
    expect(bridgeBodyLimit('/unknown')).toBe(mb);
  });
});
