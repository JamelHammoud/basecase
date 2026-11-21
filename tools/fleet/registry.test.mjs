import { afterAll, beforeAll, expect, it } from 'vitest';
import { fleetFixture } from './fixture.mjs';
import { DEPLOYMENTS } from './deployments.mjs';

let fixture;

beforeAll(async () => {
  fixture = await fleetFixture();
});
afterAll(async () => fixture?.close());

it('registers all ten deployment classes without CAD scenes or vendor-name identities', async () => {
  const admin = await fixture.bootstrap('Deployments');
  const region = await admin.create('region', { name: 'West' });
  const sites = await Promise.all(
    DEPLOYMENTS.map((deployment) => admin.create('site', { name: deployment.name, parent: region.id })),
  );
  const robots = await Promise.all(
    DEPLOYMENTS.map((deployment, index) =>
      admin.create('robot', { name: deployment.vendor, parent: sites[index].id, attributes: deployment }),
    ),
  );

  expect(new Set(robots.map((robot) => robot.id)).size).toBe(10);
  expect(new Set(robots.map((robot) => robot.name)).size).toBe(1);

  await admin.create('robot', {
    name: 'Acme',
    parent: sites[0].id,
    attributes: { class: 'warehouse', medium: 'land', vendor: 'Second maker' },
  });

  const inventory = await admin.list('robot');

  expect(inventory.items).toHaveLength(11);
  expect(
    new Set(inventory.items.filter((item) => item.parent === sites[0].id).map((item) => item.attributes.vendor)).size,
  ).toBe(2);
  expect(new Set(inventory.items.map((robot) => robot.attributes.class))).toEqual(
    new Set(DEPLOYMENTS.map((deployment) => deployment.class)),
  );
  expect(inventory.items.every((robot) => robot.stale && robot.observedAt === null)).toBe(true);
  expect((await admin.result('GET', 'contracts')).actions).toContain('robot.control');
});
