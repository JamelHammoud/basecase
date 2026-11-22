import { afterEach, expect, it, vi } from 'vitest';
import { startService } from '../../src/fleet/service/http.mjs';
import { freePort } from './postgres.mjs';

const failure = vi.hoisted(() => Object.assign(new Error('internal database detail'), { code: '57014' }));

vi.mock('../../src/fleet/service/subscriptions.mjs', () => ({
  subscriptions: async () => ({ close: async () => {} }),
}));
vi.mock('../../src/fleet/service/api.mjs', () => ({
  publicApi: async () => {
    throw failure;
  },
  authenticatedApi: vi.fn(),
}));

const services = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});

async function request(onError) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;

  services.push(await startService({ pool: {}, origin, onError }));

  return fetch(`${origin}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

it('reports internal failures to the host while preserving the generic HTTP response', async () => {
  const observed = vi.fn();
  const response = await request(observed);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Fleet request refused' });
  expect(observed).toHaveBeenCalledWith(failure, expect.objectContaining({ method: 'POST', url: '/v1/sessions' }));
});

it('keeps an observer failure from changing the HTTP response', async () => {
  const response = await request(() => {
    throw new Error('observer failed');
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Fleet request refused' });
});
