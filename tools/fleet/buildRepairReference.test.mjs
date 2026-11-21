import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fleetFixture } from './fixture.mjs';

let fixture;

beforeAll(async () => {
  fixture = await fleetFixture();
});
afterAll(async () => fixture?.close());

it('patches only existing robot build evidence under inventory authority and preserves controller metadata', async () => {
  const admin = await fixture.bootstrap('Repair references');
  const site = await admin.create('site', { name: 'Workshop' });
  const robot = await admin.create('robot', {
    name: 'Rover',
    parent: site.id,
    attributes: { controller: 'original', vendor: 'retained' },
  });
  const role = await admin.create('role', {
    name: 'Viewer',
    rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'], conditions: {} }],
  });
  const viewer = await admin.enroll('reference-viewer@example.test', [role.id]);
  const buildRepair = { build: randomUUID(), repair: randomUUID(), source: 'a'.repeat(64), target: 'b'.repeat(64) };
  const before = await admin.result('GET', `robot/${robot.id}`);

  expect((await viewer.call('PUT', `robot/${robot.id}`, { buildRepair })).status).toBe(403);
  expect(
    (await admin.call('PUT', `robot/${robot.id}`, { buildRepair: { ...buildRepair, credential: 'refused' } })).status,
  ).toBe(400);
  expect(
    (await admin.call('PUT', `robot/${robot.id}`, { buildRepair, attributes: { controller: 'forged' } })).status,
  ).toBe(400);
  expect((await admin.call('PUT', `role/${role.id}`, { buildRepair })).status).toBe(400);

  await admin.result('PUT', `robot/${robot.id}`, { buildRepair });
  await admin.result('PUT', `robot/${robot.id}`, { buildRepair });

  const after = await viewer.result('GET', `robot/${robot.id}`);

  expect(after.attributes).toEqual({
    ...before.attributes,
    buildId: buildRepair.build,
    buildRepairId: buildRepair.repair,
    buildSourceKit: buildRepair.source,
    buildTargetKit: buildRepair.target,
  });
  expect(after.generation).toBe(before.generation);
  expect(after.status).toBe(before.status);
  expect(after.parent).toBe(before.parent);
  expect((await admin.list('robot')).items.map((item) => item.id)).toEqual([robot.id]);
  expect((await admin.result('GET', `role/${role.id}`)).rules).toEqual(role.rules);
});
