import { afterAll, beforeAll, expect, it } from 'vitest';
import { fleetFixture } from './fixture.mjs';

let fixture;
let admin;
let viewer;
let siteA;
let siteB;
let robot;
let role;

beforeAll(async () => {
  fixture = await fleetFixture();
  admin = await fixture.bootstrap('North');

  const other = await fixture.bootstrap('South');

  siteA = await admin.create('site', { name: 'Hospital', attributes: { country: 'US' } });
  siteB = await admin.create('site', { name: 'Harbor' });

  const room = await admin.create('site', { name: 'Floor 2', parent: siteA.id });

  robot = await admin.create('robot', { name: 'Acme', parent: room.id, attributes: { class: 'delivery' } });
  await admin.create('robot', { name: 'Acme', parent: siteB.id });
  role = await admin.create('role', {
    name: 'Site viewer',
    rules: [{ effect: 'allow', scope: siteA.id, actions: ['inventory.view'], conditions: {} }],
  });
  viewer = await admin.enroll('viewer@example.test', [role.id]);
  fixture.other = other;
});

afterAll(async () => fixture?.close());

it('scopes enumeration, nested sites and forged cross-site or cross-organization IDs', async () => {
  expect((await viewer.list('site')).items.map((item) => item.name).sort()).toEqual(['Floor 2', 'Hospital']);
  expect((await viewer.list('robot')).items.map((item) => item.id)).toEqual([robot.id]);
  expect((await viewer.call('GET', `robot/${robot.id}`)).status).toBe(200);
  expect((await viewer.call('GET', `site/${siteB.id}`)).status).toBe(403);
  expect((await viewer.call('GET', `site/${siteA.id}`, null, fixture.other.org)).status).toBe(403);
  expect((await viewer.call('GET', 'role')).status).toBe(403);
  expect((await viewer.call('GET', 'export')).status).toBe(403);
});

it('supports role CRUD, group grants, attribute conditions and deny overrides', async () => {
  const helper = await admin.enroll('helper@example.test', []);
  const group = await admin.create('group', { name: 'US support', members: [helper.id], roles: [role.id] });

  expect((await helper.list('robot')).items).toHaveLength(1);

  const rules = [
    {
      effect: 'allow',
      scope: '*',
      actions: ['inventory.view'],
      conditions: { site: { country: ['US'] }, robot: { class: ['delivery'] } },
    },
  ];

  await admin.update('role', role.id, { name: 'Conditional viewer', rules });
  expect((await helper.list('robot')).items).toHaveLength(1);
  await admin.update('role', role.id, {
    name: 'Conditional viewer',
    rules: [...rules, { effect: 'deny', scope: siteA.id, actions: ['inventory.view'], conditions: {} }],
  });
  expect((await helper.list('robot')).items).toHaveLength(0);
  await admin.remove('group', group.id);
  expect((await helper.list('robot')).items).toHaveLength(0);
  await admin.update('role', role.id, {
    name: 'Site viewer',
    rules: [{ effect: 'allow', scope: siteA.id, actions: ['inventory.view'], conditions: {} }],
  });

  const temporary = await admin.create('role', { name: 'Temporary', rules: [] });

  await admin.remove('role', temporary.id);
  expect((await admin.call('GET', `role/${temporary.id}`)).status).toBe(403);
});

it('authenticates asset reads and subscriptions, and revokes a live subscription on role change', async () => {
  const asset = await admin.create('asset', {
    name: 'Identity',
    parent: robot.id,
    content: 'robot identity',
    mediaType: 'text/plain',
  });

  expect((await viewer.call('GET', `asset/${asset.id}/content`)).status).toBe(200);
  expect((await fixture.anonymous(`/${admin.org}/asset/${asset.id}/content`)).status).toBe(401);

  const stream = await viewer.subscribe();

  await stream.next();
  await admin.update('role', role.id, { name: 'Site viewer', rules: [] });
  expect((await stream.next()).event).toBe('reset');
  expect((await viewer.list('robot')).items).toHaveLength(0);
  await stream.close();
});

it('revokes sessions and rejects replayed enrollment secrets', async () => {
  const user = await admin.enroll('revoked@example.test', [role.id]);

  const stream = await user.subscribe();
  const unaffected = await viewer.subscribe();

  await stream.next();
  await unaffected.next();
  await admin.call('DELETE', `credentials/${user.credential}`);
  expect((await stream.next()).event).toBe('reset');
  await admin.generation(robot.id);
  expect((await unaffected.next()).event).toBe('snapshot');
  await unaffected.close();
  await stream.close();
  expect((await user.call('GET', 'site')).status).toBe(401);
  expect((await fixture.enroll(user.invite, 'another-password-long')).status).toBe(401);
});

it('keeps identities and timestamped status through service restarts and disconnects', async () => {
  const credential = await admin.service([
    { effect: 'allow', scope: siteA.id, actions: ['status.publish'], conditions: {} },
  ]);
  const generation = await credential.generation(robot.id);
  const update = {
    robot: robot.id,
    event: 'first-event',
    generation,
    observedAt: new Date(Date.now() - 120000).toISOString(),
    status: 'offline',
  };

  expect((await credential.publish([update])).accepted).toBe(1);
  expect((await credential.publish([update])).accepted).toBe(0);
  expect((await credential.call('GET', 'robot')).status).toBe(200);
  expect((await credential.list('robot')).items).toHaveLength(0);
  expect(
    (
      await credential.call(
        'POST',
        `generations/${(await admin.list('robot')).items.find((item) => item.parent === siteB.id).id}`,
        {},
      )
    ).status,
  ).toBe(403);
  await credential.generation(robot.id);
  expect(
    (await credential.publish([{ ...update, event: 'old-generation', observedAt: new Date().toISOString() }])).accepted,
  ).toBe(0);
  await fixture.restart();

  const saved = await (await admin.call('GET', `robot/${robot.id}`)).json();

  expect(saved.status).toBe('offline');
  expect(saved.stale).toBe(true);
  expect(saved.observedAt).toBe(update.observedAt);
});

it('rejects forged origins, cross-organization role references and oversized updates', async () => {
  const origin = await fetch(`${fixture.origin}/v1/${admin.org}/robot`, {
    headers: { Authorization: `Bearer ${admin.token}`, Origin: 'https://other.example' },
  });

  expect(origin.status).toBe(403);
  expect((await fixture.anonymous(`/${admin.org}/subscribe`)).status).toBe(401);

  const foreignRole = await fixture.other.create('role', { name: 'Foreign', rules: [] });

  expect((await admin.call('POST', 'group', { name: 'Forged', roles: [foreignRole.id] })).status).toBe(403);
  expect(
    (
      await admin.call(
        'POST',
        'status',
        Array.from({ length: 101 }, () => ({})),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await admin.call('POST', 'role', {
        name: 'Unknown action',
        rules: [{ effect: 'allow', scope: '*', actions: ['anything'], conditions: {} }],
      })
    ).status,
  ).toBe(400);
});

it('enforces attribute conditions on both creation and the old and new values of an update', async () => {
  const editorRole = await admin.create('role', {
    name: 'Delivery editor',
    rules: [
      {
        effect: 'allow',
        scope: siteA.id,
        actions: ['inventory.manage', 'inventory.view'],
        conditions: { robot: { class: ['delivery'] } },
      },
    ],
  });
  const editor = await admin.enroll('editor@example.test', [editorRole.id]);
  const item = await editor.create('robot', {
    name: 'Delivery 02',
    parent: siteA.id,
    attributes: { class: 'delivery' },
  });

  expect(
    (await editor.call('PUT', `robot/${item.id}`, { name: 'Delivery 03', attributes: { class: 'delivery' } })).status,
  ).toBe(200);
  expect(
    (await editor.call('PUT', `robot/${item.id}`, { name: 'Outside scope', attributes: { class: 'inspection' } }))
      .status,
  ).toBe(403);
  expect(
    (await editor.call('POST', 'robot', { name: 'Inspection', parent: siteA.id, attributes: { class: 'inspection' } }))
      .status,
  ).toBe(403);
  expect(
    (await editor.call('POST', 'robot', { name: 'Other site', parent: siteB.id, attributes: { class: 'delivery' } }))
      .status,
  ).toBe(403);
});

it('exports only authorized inventory and excludes identity credentials', async () => {
  const exportRole = await admin.create('role', {
    name: 'Site exporter',
    rules: [{ effect: 'allow', scope: siteA.id, actions: ['inventory.export'], conditions: {} }],
  });
  const exporter = await admin.enroll('exporter@example.test', [exportRole.id]);
  const response = await exporter.call('GET', 'export');
  const result = await response.json();

  expect(response.status).toBe(200);
  expect(result.items.length).toBeGreaterThan(0);
  expect(result.items.some((item) => item.parent === siteB.id)).toBe(false);

  const serialized = JSON.stringify(result);

  expect(serialized).not.toContain(admin.token);
  expect(serialized).not.toContain(exporter.token);
  expect(serialized).not.toContain('password');
  expect((await exporter.list('robot')).items).toHaveLength(0);
});
