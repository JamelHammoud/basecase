import { expect, it, vi } from 'vitest';
import { trustedIpc } from '../appOrigin.mjs';
import { guardBridge } from '../bridgeGuard.mjs';
import { registerElectricalHandlers, electricalPostRoutes } from './routes.mjs';

it('refuses foreign frames and origins before native board calls', async () => {
  const handlers = new Map();
  const store = { validate: vi.fn(async () => ({})), cancel: vi.fn(() => ({ ok: true })) };

  registerElectricalHandlers(
    trustedIpc({ handle: (name, handler) => handlers.set(name, handler) }, 'basecase://app'),
    store,
  );

  for (const handler of handlers.values()) {
    expect(() => handler({ senderFrame: { url: 'https://evil.test', parent: null } }, {})).toThrow('Refused');
    expect(() => handler({ senderFrame: { url: 'basecase://app', parent: {} } }, {})).toThrow('Refused');
  }

  const route = electricalPostRoutes(store).find(([name]) => name === '/electrical-validate')[1];
  const dispatch = vi.fn(() => route({ arg: {} }));
  const response = { setHeader: vi.fn(), end: vi.fn() };

  guardBridge(dispatch)({ headers: { host: 'localhost:5173', origin: 'https://evil.test' } }, response);
  expect(response.statusCode).toBe(403);
  expect(dispatch).not.toHaveBeenCalled();
  await handlers.get('electrical:validate')({ senderFrame: { url: 'basecase://app', parent: null } }, {});
  expect(store.validate).toHaveBeenCalledOnce();
});
