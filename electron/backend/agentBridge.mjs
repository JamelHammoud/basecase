import http from 'node:http';
import crypto from 'node:crypto';
import { DEFAULT_WORKSPACE } from './constants.mjs';

const MAX_BODY_BYTES = 80_000_000;
const DEFAULT_TIMEOUT_MS = 60000;

const RENDERER_TIMEOUTS_MS = new Map([
  ['apply', 180000],
  ['animate', 180000],
  ['simulate', 180000],
  ['import_robot', 300000],
  ['retarget', 300000],
]);

export const rendererTimeout = (kind) => RENDERER_TIMEOUTS_MS.get(kind) ?? DEFAULT_TIMEOUT_MS;

const newRequestId = () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export class AgentBridge {
  constructor({ events, onError }) {
    this.events = events;
    this.onError = onError;
    this.pending = new Map();
    this.token = crypto.randomBytes(12).toString('hex');
    this.url = null;
    this.server = null;
    this.ready = Promise.resolve(null);
  }

  routeOf(req) {
    const m = new RegExp(`^/${this.token}/(?:w/([a-zA-Z0-9_-]+)/)?agent/([a-z_]+)$`).exec(req.url ?? '');

    if (req.method !== 'POST' || !m) return null;

    return { workspaceId: m[1] ?? DEFAULT_WORKSPACE, kind: m[2] };
  }

  async answer({ kind, workspaceId, body }, res) {
    res.setHeader('Content-Type', 'application/json');

    try {
      const payload = body ? JSON.parse(body) : {};

      if (kind === 'status') {
        this.events.emit({ type: 'agent-status', workspaceId, status: String(payload.status || '') });
        res.end(JSON.stringify({ ok: true }));

        return;
      }

      const result = await this.requestRenderer(kind, payload, rendererTimeout(kind), workspaceId);

      res.end(JSON.stringify(result ?? { ok: true }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  }

  handle(req, res) {
    const route = this.routeOf(req);

    if (!route) {
      res.statusCode = 404;
      res.end('{}');

      return;
    }

    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_BYTES) req.destroy();
    });
    req.on('end', () => this.answer({ ...route, body }, res));
  }

  start() {
    this.ready = new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));

      server.on('error', (err) => {
        this.onError(`Agent bridge failed: ${err.message}`);
        resolve(null);
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();

        this.url = `http://127.0.0.1:${port}/${this.token}`;
        resolve(this.url);
      });
      server.unref();
      this.server = server;
    });

    return this.ready;
  }

  requestRenderer(kind, payload, timeoutMs = DEFAULT_TIMEOUT_MS, workspaceId) {
    if (this.events.size === 0) {
      return Promise.reject(new Error('The app window is not open.'));
    }

    const requestId = newRequestId();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`The app did not answer "${kind}" in time.`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      this.events.emit({ type: 'agent-request', requestId, kind, payload, workspaceId });
    });
  }

  resolveRequest({ requestId, result, error }) {
    const pending = this.pending.get(requestId);

    if (!pending) return { ok: false };

    clearTimeout(pending.timer);
    this.pending.delete(requestId);

    if (error) pending.reject(new Error(String(error)));
    else pending.resolve(result);

    return { ok: true };
  }
}
