import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const calls = [];

vi.mock('./backend-service.mjs', () => ({
  BasecaseBackendService: class {
    constructor() {
      return new Proxy(this, {
        get: (target, name) => {
          if (name === 'requestRenderer')
            return async (...args) => (calls.push([name, ...args]), args[0] === 'none' ? null : { ok: 1 });

          if (name === 'onEvent')
            return (fn) => (calls.push([name]), fn({ type: 'hello' }), () => calls.push(['unsubscribe']));

          if (name === 'connectAcpAgent') return async (...args) => (calls.push([name, ...args]), { connected: true });

          if (name === 'trainStop')
            return () => {
              throw new Error('boom');
            };

          return (...args) => (calls.push([name, ...args]), { from: name });
        },
      });
    }
  },
}));

const { bridgeMiddlewarePlugin } = await import('./vite-bridge-middleware.mjs');

function mountPlugin() {
  const handlers = {};

  bridgeMiddlewarePlugin().configureServer({ middlewares: { use: (prefix, fn) => (handlers[prefix] = fn) } });

  return handlers;
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, chunks: [] };

  res.setHeader = (k, v) => (res.headers[k] = v);
  res.writeHead = (code, headers) => Object.assign(res, { statusCode: code, headers });
  res.write = (c) => res.chunks.push(c);
  res.done = new Promise((resolve) => {
    res.end = (c) => resolve(c === undefined ? undefined : JSON.parse(c));
  });

  return res;
}

function sendBody(req, body) {
  if (body !== undefined) req.emit('data', Buffer.from(body));

  req.emit('end');
}

async function request(handler, { method, url, body }) {
  const req = Object.assign(new EventEmitter(), { method, url });
  const res = fakeRes();
  const next = vi.fn();

  calls.length = 0;
  handler(req, res, next);

  if (method === 'POST') sendBody(req, body);

  const result = next.mock.calls.length ? 'next' : await res.done;

  return { result, status: res.statusCode, calls: [...calls] };
}

describe('vite bridge middleware', () => {
  const { '/api/bridge': bridge, '/api/events': events } = mountPlugin();

  it('serves GET routes', async () => {
    expect(await request(bridge, { method: 'GET', url: '/acp-status?workspace=w2' })).toEqual({
      result: { from: 'getAcpStatus' },
      status: 200,
      calls: [['getAcpStatus', 'w2']],
    });
    expect((await request(bridge, { method: 'GET', url: '/acp-status' })).calls).toEqual([['getAcpStatus', undefined]]);
    expect((await request(bridge, { method: 'GET', url: '/policy?id=p1' })).calls).toEqual([['getPolicy', 'p1']]);
    expect((await request(bridge, { method: 'GET', url: '/chat?id=c1' })).calls).toEqual([['getConversation', 'c1']]);
    expect((await request(bridge, { method: 'GET', url: '/chats' })).calls).toEqual([['listConversations']]);
    expect((await request(bridge, { method: 'GET', url: '/nope' })).result).toBe('next');
  });

  it('serves POST routes', async () => {
    const post = (url, payload) => request(bridge, { method: 'POST', url, body: JSON.stringify(payload) });

    expect(await post('/acp-resume', { sessionId: 's', workspaceId: 'w' })).toEqual({
      result: { from: 'resumeAcpConversation' },
      status: 200,
      calls: [['resumeAcpConversation', 's', 'w']],
    });
    expect((await post('/acp-connect', { agentCommand: 'c' })).calls).toEqual([['connectAcpAgent', 'c']]);
    expect((await post('/delete-scene', { sceneId: 'x' })).calls).toEqual([['deleteScene', 'x']]);
    expect(await post('/agent-call', { kind: 'look', workspaceId: 'w' })).toEqual({
      result: { ok: 1 },
      status: 200,
      calls: [['requestRenderer', 'look', {}, 180000, 'w']],
    });
    expect((await post('/agent-call', { kind: 'none' })).result).toEqual({});
    expect(await request(bridge, { method: 'POST', url: '/scenes' })).toMatchObject({
      result: { error: 'Unknown bridge endpoint' },
      status: 404,
    });
    expect(await request(bridge, { method: 'POST', url: '/save-scene', body: '{bad' })).toMatchObject({ status: 500 });
    expect(await post('/train-stop', {})).toEqual({ result: { error: 'Error: boom' }, status: 500, calls: [] });
    expect((await request(bridge, { method: 'PUT', url: '/scenes' })).result).toBe('next');
  });

  it('streams events and starts the agent once', () => {
    const req = new EventEmitter();
    const res = fakeRes();

    calls.length = 0;
    events(req, res);
    events(new EventEmitter(), fakeRes());
    req.emit('close');

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.chunks).toEqual([
      `data: ${JSON.stringify({ type: 'acp-status', status: { from: 'getAcpStatus' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'hello' })}\n\n`,
    ]);
    expect(calls.filter(([name]) => name === 'connectAcpAgent')).toHaveLength(1);
    expect(calls.at(-1)).toEqual(['unsubscribe']);
  });
});
