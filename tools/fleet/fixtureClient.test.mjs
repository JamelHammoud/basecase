import { afterEach, expect, it, vi } from 'vitest';
import { fleetClient } from './fixture.mjs';

const client = () => fleetClient({ origin: 'http://127.0.0.1:9999' }, { org: 'fixture', token: 'fixture-token' });

afterEach(() => vi.unstubAllGlobals());

it('retains the service error when Fleet fixture setup is rejected', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'Parent kind differs.' }), { status: 400 })),
  );
  await expect(client().create('robot', { name: 'Rover' })).rejects.toThrow('POST robot: 400: Parent kind differs.');
});

it('keeps the status when no service error text is available', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 400 })),
  );
  await expect(client().create('robot', { name: 'Rover' })).rejects.toThrow('POST robot: 400');
});

it('retains a matching internal service diagnostic only in the trusted fixture failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'Fleet request refused' }), { status: 400 })),
  );

  const fixture = {
    origin: 'http://127.0.0.1:9999',
    failures: [
      {
        method: 'POST',
        path: '/v1/fixture/robot',
        code: '57014',
        message: 'query deadline exceeded',
      },
    ],
  };
  const target = fleetClient(fixture, { org: 'fixture', token: 'fixture-token' });

  await expect(target.create('robot', { name: 'Rover' })).rejects.toThrow('57014: query deadline exceeded');
});
