import { EventEmitter } from 'node:events';
import http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { guardBridge } from '../bridgeGuard.mjs';
import { phoneBridgeMiddleware } from './phoneBridge.mjs';

function fakePhone() {
  const listeners = new Set();

  return {
    listeners,
    pair: async () => ({ ok: true, url: 'https://127.0.0.1:1/?t=x', token: 'x' }),
    unpair: () => ({ ok: true }),
    state: () => ({ pairing: false, connected: false, name: null }),
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
  };
}

function call(handler, { method, url, headers = { host: 'localhost:5173' } }) {
  const req = Object.assign(new EventEmitter(), { method, url, headers, resume: vi.fn() });
  const res = { statusCode: 200, chunks: [], headers: {} };
  const next = vi.fn();

  res.setHeader = (key, value) => (res.headers[key] = value);
  res.writeHead = (status, headers) => Object.assign(res, { statusCode: status, headers });
  res.flushHeaders = vi.fn();
  res.write = (chunk) => res.chunks.push(chunk);
  res.done = new Promise((resolve) => (res.end = resolve));
  handler(req, res, next);

  return { req, res, next };
}

describe('phoneBridgeMiddleware', () => {
  const phone = fakePhone();
  const handler = guardBridge(phoneBridgeMiddleware(phone));

  it('answers pair, unpair and state as JSON', async () => {
    expect(JSON.parse(await call(handler, { method: 'POST', url: '/phone-pair' }).res.done)).toMatchObject({
      ok: true,
    });
    expect(JSON.parse(await call(handler, { method: 'POST', url: '/phone-unpair' }).res.done)).toEqual({ ok: true });
    expect(JSON.parse(await call(handler, { method: 'GET', url: '/phone-state' }).res.done)).toEqual(phone.state());
  });

  it('streams events to a real client until it hangs up, after the request body is read', async () => {
    const server = http.createServer((req, res) => handler(req, res, () => res.end()));
    const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    const chunks = [];
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: '/phone-events',
      headers: { host: `localhost:${port}` },
    });
    const response = await new Promise((resolve) => request.on('response', resolve));

    response.on('data', (chunk) => chunks.push(String(chunk)));
    await new Promise((resolve) => setTimeout(resolve, 50));
    phone.listeners.forEach((listener) => listener({ type: 'phone', state: 'closed' }));
    await vi.waitFor(() =>
      expect(chunks.join('')).toBe(`data: ${JSON.stringify({ type: 'phone', state: 'closed' })}\n\n`),
    );
    expect(response.headers['content-type']).toBe('text/event-stream');
    request.destroy();
    await vi.waitFor(() => expect(phone.listeners.size).toBe(0));
    server.close();
  });

  it('passes other bridge routes on', () => {
    expect(call(handler, { method: 'GET', url: '/phone-pair' }).next).toHaveBeenCalled();
    expect(call(handler, { method: 'POST', url: '/scenes' }).next).toHaveBeenCalled();
  });

  it('refuses a cross-site page before pairing', async () => {
    const headers = { host: 'localhost:5173', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
    const { res } = call(handler, { method: 'POST', url: '/phone-pair', headers });

    await res.done;
    expect(res.statusCode).toBe(403);
  });
});
