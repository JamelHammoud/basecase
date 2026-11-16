import { prepareFacility } from '../../src/fleet/sites/facility';
import { factoryDxf } from '../../src/fleet/sites/siteFixtures';
import { writeFile } from 'node:fs/promises';
import { facilityJobs } from '../../src/fleet/service/facilities.mjs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fleetFixture } from './fixture.mjs';

let fixture;
let admin;
let site;
let robot;
let viewer;
let geometry;
const files = [{ name: 'factory.dxf', base64: Buffer.from(factoryDxf).toString('base64') }];
const controls = {
  datum: 'WGS84',
  vertical: { kind: 'ellipsoid' },
  controls: [
    { local: [0, 0, 0], latitude: 0, longitude: 0, altitudeM: 20 },
    { local: [10, 0, 0], latitude: 0, longitude: 0.0000898315284, altitudeM: 20 },
  ],
};

beforeAll(async () => {
  geometry = await prepareFacility([{ name: 'factory.dxf', bytes: new TextEncoder().encode(factoryDxf) }], {
    units: 'mm',
    up: 'Z',
  });
  fixture = await fleetFixture();
  admin = await fixture.bootstrap('Maps');
  site = await admin.create('site', { name: 'Factory' });
  robot = await admin.create('robot', { name: 'Rover', parent: site.id });

  const role = await admin.create('role', {
    name: 'Viewer',
    rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'], conditions: {} }],
  });

  viewer = await admin.enroll('maps-viewer@example.test', [role.id]);
});

afterAll(async () => fixture?.close());

it('persists the source hash and explicit registration independently of facility floor height', async () => {
  const started = performance.now();
  const imported = await admin.result('PUT', `site/${site.id}/facility`, { files, geometry });

  const elapsedMs = performance.now() - started;

  if (process.env.FLEET_FACILITY_SERVICE_MEASUREMENTS_FILE)
    await writeFile(
      process.env.FLEET_FACILITY_SERVICE_MEASUREMENTS_FILE,
      JSON.stringify({ elapsedMs, preparation: imported.facility.preparation }, null, 2),
    );

  expect(imported.registration).toBeNull();
  expect(imported.facility.sources[0].hash).toMatch(/^[0-9a-f]{64}$/);
  await admin.result('PUT', `site/${site.id}/facility/registration`, { ...controls, facility: imported.facility.hash });
  await fixture.restart();

  const reopened = await viewer.result('GET', `site/${site.id}/facility`);
  const restored = await viewer.result('GET', `site/${site.id}/facility/geometry`);

  expect(reopened.registration.controls).toEqual(controls.controls);
  expect(restored.lines).toEqual(geometry.lines);
  expect(reopened.facility.hash).toBe(imported.facility.hash);
  expect(
    (await admin.call('PUT', `site/${site.id}/facility/registration`, { ...controls, facility: 'b'.repeat(64) }))
      .status,
  ).toBe(409);
});

it('rejects unregistered, conflicting, oversize and malicious asset requests', async () => {
  expect((await viewer.call('PUT', `site/${site.id}/facility`, { files, geometry })).status).toBe(403);
  expect(
    (await admin.call('PUT', `site/${site.id}/facility`, { files: [{ name: '../escape.usda', base64: '' }], geometry }))
      .status,
  ).toBe(400);
  expect(
    (
      await admin.call('PUT', `site/${site.id}/facility`, {
        files,
        geometry: { ...geometry, points: [Infinity, 0, 0] },
      })
    ).status,
  ).toBe(400);
  expect(
    (await admin.call('PUT', `site/${site.id}/facility/registration`, { ...controls, datum: 'NAD83' })).status,
  ).toBe(400);
  expect(
    (
      await admin.call('PUT', `site/${site.id}/facility/registration`, {
        ...controls,
        vertical: { kind: 'orthometric' },
      })
    ).status,
  ).toBe(400);

  const other = await admin.create('site', { name: 'Unregistered' });
  const unregistered = await admin.create('robot', { name: 'Unknown', parent: other.id });
  const generation = await admin.generation(unregistered.id);

  expect(
    (
      await admin.call('POST', 'status', [
        {
          robot: unregistered.id,
          event: randomUUID(),
          generation,
          status: 'online',
          observedAt: new Date().toISOString(),
          pose: { frame: 'facility', site: other.id, facility: 'a'.repeat(64), pointM: [0, 0, 0], quality: 'reported' },
        },
      ])
    ).status,
  ).toBe(400);
});

it('keeps replay-fed robot poses, freshness and declared work within identity status envelopes', async () => {
  const facility = await admin.result('GET', `site/${site.id}/facility`);
  const generation = await admin.generation(robot.id);
  const observedAt = new Date(Date.now() - 120000).toISOString();

  await admin.publish([
    {
      robot: robot.id,
      event: randomUUID(),
      generation,
      status: 'online',
      observedAt,
      pose: {
        frame: 'facility',
        site: site.id,
        facility: facility.facility.hash,
        pointM: [2, 3, 4],
        floor: 'Ground',
        quality: 'estimated',
      },
      work: { current: 'Inspect line', next: 'Return to dock' },
    },
  ]);

  const result = await viewer.result('GET', `robot/${robot.id}`);

  expect(result.pose.observedAt).toBe(observedAt);
  expect(result.pose.pointM).toEqual([2, 3, 4]);
  expect(result.stale).toBe(true);
  expect(result.work.next).toBe('Return to dock');
  expect((await viewer.result('GET', `site/${site.id}`)).registration.controls).toEqual(controls.controls);
});

it('denies another site, organization, revoked viewer and unauthorized tiles', async () => {
  const other = await admin.create('site', { name: 'Private' });
  const foreign = await fixture.bootstrap('Foreign');

  expect((await viewer.call('GET', `site/${other.id}/facility`)).status).toBe(403);
  expect((await foreign.call('GET', `site/${site.id}/facility`, null, admin.org)).status).toBe(403);
  expect((await viewer.call('GET', `site/${site.id}/facility/tiles`)).status).toBe(404);
  await admin.update('account', viewer.id, { name: 'Revoked', roles: [] });
  expect((await viewer.call('GET', `site/${site.id}/facility/geometry`)).status).toBe(403);
});

it('reserves at most two preparation workers before reading large request bodies', async () => {
  const jobs = facilityJobs();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const request = () => ({
    async *[Symbol.asyncIterator]() {
      await gate;
      yield Buffer.from('{}');
    },
  });
  const first = jobs.prepare(request(), 'import').catch(() => null);
  const second = jobs.prepare(request(), 'import').catch(() => null);

  await expect(jobs.prepare(request(), 'import')).rejects.toMatchObject({ status: 503 });
  release();
  await Promise.all([first, second]);
});
