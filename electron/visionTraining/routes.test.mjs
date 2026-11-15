import { describe, expect, it, vi } from 'vitest';
import { trustedIpc } from '../appOrigin.mjs';
import { guardBridge } from '../bridgeGuard.mjs';
import { registerVisionTrainingHandlers, visionTrainingPostRoutes } from './routes.mjs';

const APP = 'basecase://app';

function storeOf() {
  return Object.fromEntries(
    ['start', 'status', 'stop', 'artifact', 'saveRun', 'runs'].map((name) => [
      name,
      vi.fn(async (value) => ({ name, value })),
    ]),
  );
}

describe('protected vision training routes', () => {
  it('refuses foreign frames before every IPC operation', async () => {
    const handlers = new Map();
    const store = storeOf();

    registerVisionTrainingHandlers(trustedIpc({ handle: (name, handler) => handlers.set(name, handler) }, APP), store);

    for (const [name, handler] of handlers) {
      for (const senderFrame of [
        { url: 'https://evil.test', parent: null },
        { url: APP, parent: {} },
        { url: 'basecase://app.evil', parent: null },
      ])
        expect(() => handler({ senderFrame }, 'payload')).toThrow('Refused');

      const value = await handler({ senderFrame: { url: APP, parent: null } }, 'payload');

      expect(value.value).toBe('payload');
      expect(name).toMatch(/^vision-training:/);
    }

    expect(store.start).toHaveBeenCalledOnce();
    expect(store.artifact).toHaveBeenCalledOnce();
  });

  it('shares bounded calls over HTTP and rejects foreign origins before dispatch', async () => {
    const store = storeOf();
    const routes = visionTrainingPostRoutes(store);
    const start = routes.find(([name]) => name === '/vision-training-start')[1];
    const dispatch = vi.fn((req) => start(req.body));
    const guard = guardBridge(dispatch);
    const response = { setHeader: vi.fn(), end: vi.fn() };

    guard({ headers: { host: 'localhost:5173', origin: 'https://evil.test' }, body: { arg: 'payload' } }, response);
    expect(response.statusCode).toBe(403);
    expect(dispatch).not.toHaveBeenCalled();
    guard({ headers: { host: 'localhost:5173', origin: 'http://localhost:5173' }, body: { arg: 'payload' } }, response);
    expect(await dispatch.mock.results[0].value).toEqual({ name: 'start', value: 'payload' });
  });
});
