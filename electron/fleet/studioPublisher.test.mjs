import { afterEach, expect, it, vi } from 'vitest';
import { StudioPublisher } from './studioPublisher.mjs';

const robot = '00000000-0000-0000-0000-000000000002';
const publisher = () =>
  new StudioPublisher({
    origin: 'http://127.0.0.1:7440',
    org: '00000000-0000-0000-0000-000000000001',
    token: 'a'.repeat(43),
    units: { robot },
  });
const connected = { unit: 'robot', event: 'link', state: 'connected' };

afterEach(() => vi.unstubAllGlobals());

it('sends the pending disconnect after a failed request without retrying the failed observation', async () => {
  const blocked = Promise.withResolvers();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(blocked.promise)
    .mockResolvedValueOnce(Response.json({ generation: 1 }))
    .mockResolvedValueOnce(Response.json({ accepted: 1 }));

  vi.stubGlobal('fetch', fetcher);

  const studio = publisher();
  const active = studio.publish(connected);

  void studio.publish({ unit: 'robot', event: 'link', state: 'closed' });
  blocked.resolve(new Response('', { status: 503 }));
  await active;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject([{ robot, status: 'offline', generation: 1 }]);
  expect(studio.pending.size).toBe(0);
  expect(studio.active.size).toBe(0);
});

it('does not reuse an old connection generation after reconnect allocation fails', async () => {
  const blocked = Promise.withResolvers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ generation: 1 }))
    .mockResolvedValueOnce(Response.json({ accepted: 1 }))
    .mockReturnValueOnce(blocked.promise)
    .mockResolvedValueOnce(Response.json({ generation: 3 }))
    .mockResolvedValueOnce(Response.json({ accepted: 1 }));

  vi.stubGlobal('fetch', fetcher);

  const studio = publisher();

  await studio.publish(connected);

  const active = studio.publish(connected);

  void studio.publish({ unit: 'robot', event: 'status', fault_latched: true });
  blocked.resolve(new Response('', { status: 503 }));
  await active;
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toMatchObject([{ robot, status: 'fault', generation: 3 }]);
});
