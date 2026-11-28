import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { subscriptions } from '../../src/fleet/service/subscriptions.mjs';

const authority = vi.hoisted(() => ({ current: true }));

vi.mock('../../src/fleet/service/identity.mjs', () => ({
  authenticate: async () => {
    if (!authority.current) throw new Error('Revoked');

    return {};
  },
}));
vi.mock('../../src/fleet/service/registry.mjs', () => ({
  demand: () => undefined,
  organization: () => ({}),
  listResources: async () => ({ items: [], next: null }),
}));

afterEach(() => {
  authority.current = true;
});

async function fixture(access) {
  const listener = Object.assign(new EventEmitter(), {
    query: vi.fn(async () => ({})),
    release: vi.fn(),
  });
  const service = await subscriptions({ connect: async () => listener });
  const messages = [];
  const response = Object.assign(new EventEmitter(), {
    writeHead: vi.fn(),
    write: (message) => messages.push(message.trim()),
    end() {
      response.writableEnded = true;
      response.emit('close');
    },
    writableLength: 0,
    writableEnded: false,
    destroyed: false,
  });
  const notify = () =>
    listener.emit('notification', { payload: JSON.stringify({ org: 'org', kind: 'fleet_resources' }) });
  const open = () =>
    service.open({
      request: new EventEmitter(),
      response,
      token: 'fixture',
      actor: { org: 'org', credential: 'credential' },
      access,
    });

  return { service, messages, response, notify, open };
}

it.each([false, true])(
  'starts a fresh subscription after pending identity notifications, access=%s',
  async (access) => {
    const app = await fixture(access);

    try {
      queueMicrotask(app.notify);
      await app.open();
      await setImmediate();
      expect(app.messages).toEqual([
        `event: snapshot\ndata: ${JSON.stringify(access ? {} : { items: [], next: null })}`,
      ]);
      expect(app.response.writableEnded).toBe(false);
      authority.current = false;
      app.notify();
      await setImmediate();
      expect(app.messages.at(-1)).toBe('event: reset\ndata: {}');
      expect(app.response.writableEnded).toBe(true);
    } finally {
      await app.service.close();
    }
  },
);
