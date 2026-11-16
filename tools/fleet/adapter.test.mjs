import { afterAll, beforeAll, expect, it } from 'vitest';
import { checkedFleetOrigin, StudioPublisher } from '../../electron/fleet/studioPublisher.mjs';
import { startService } from '../../src/fleet/service/http.mjs';
import { fleetFixture } from './fixture.mjs';
import { attachLoopback } from './loopback.mjs';

let fixture;
let loopback;

beforeAll(async () => {
  fixture = await fleetFixture();
});
afterAll(async () => {
  await loopback?.close();
  await fixture?.close();
});

it('publishes a loopback studio identity through scoped credentials and retains it after disconnect', async () => {
  const admin = await fixture.bootstrap('Studio');
  const site = await admin.create('site', { name: 'Bench' });
  const robot = await admin.create('robot', { name: 'Bench arm', parent: site.id });
  const credential = await admin.service([
    { effect: 'allow', scope: site.id, actions: ['status.publish'], conditions: {} },
  ]);
  const publisher = new StudioPublisher({
    origin: fixture.origin,
    org: admin.org,
    token: credential.token,
    units: { robot: robot.id },
  });

  loopback = await attachLoopback(publisher);

  const observed = await admin.result('GET', `robot/${robot.id}`);

  expect(observed.status).toBe('online');
  expect(observed.stale).toBe(false);
  expect(observed.generation).toBe(1);
  await loopback.disconnect();
  expect((await admin.result('GET', `robot/${robot.id}`)).status).toBe('offline');
  expect((await admin.list('robot')).items).toHaveLength(1);
});

it('refuses insecure remote transports, credential-bearing URLs and nonloopback HTTP binds', async () => {
  expect(() => checkedFleetOrigin('http://example.test')).toThrow();
  expect(() => checkedFleetOrigin('https://user:secret@example.test')).toThrow();
  expect(() => checkedFleetOrigin('http://127.0.0.1:7440')).not.toThrow();
  await expect(startService({ origin: 'http://127.0.0.1:7440', host: '0.0.0.0', pool: {} })).rejects.toThrow();
  await expect(startService({ origin: 'http://example.test', pool: {} })).rejects.toThrow();
});
