import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { startService } from '../../src/fleet/service/http.mjs';

afterEach(() => vi.restoreAllMocks());

it.each([
  ['http://127.0.0.1', false, 80],
  ['https://fleet.example.test', true, 443],
  ['https://fleet.example.test:7440', true, 7440],
])('listens on the configured origin port for %s', async (origin, secure, port) => {
  const listener = new EventEmitter();

  listener.query = vi.fn();
  listener.release = vi.fn();

  const server = new EventEmitter();

  server.listen = vi.fn((_port, _host, ready) => ready());
  server.close = vi.fn((done) => done());
  server.closeAllConnections = vi.fn();
  vi.spyOn(secure ? https : http, 'createServer').mockReturnValue(server);

  const service = await startService({
    pool: { connect: async () => listener },
    origin,
    tls: secure ? {} : undefined,
  });

  try {
    expect(server.listen.mock.calls[0][0]).toBe(port);
  } finally {
    await service.close();
  }
});
