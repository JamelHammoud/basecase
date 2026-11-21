import { afterAll, beforeAll, expect, it } from 'vitest';
import { fleetFixture } from './fixture.mjs';
import { DEPLOYMENTS } from './deployments.mjs';

let fixture;
let admin;

beforeAll(async () => {
  fixture = await fleetFixture();
  admin = await fixture.bootstrap('Access matrix');
});
afterAll(async () => fixture?.close());

const CASES = [
  { action: 'inventory.view', permitted: ['inventory.view'], denied: ['inventory.export', 'iam.manage'] },
  { action: 'incident.respond', permitted: ['incident.respond'], denied: ['work.schedule', 'robot.control'] },
  { action: 'work.schedule', permitted: ['work.schedule'], denied: ['software.deploy', 'robot.control'] },
  { action: 'inventory.view', permitted: ['inventory.view'], denied: ['inventory.manage', 'iam.manage'], group: true },
  {
    action: 'status.publish',
    permitted: ['status.publish'],
    denied: ['inventory.view', 'robot.control'],
    service: true,
  },
  { action: 'inventory.export', permitted: ['inventory.export'], denied: ['inventory.view', 'inventory.manage'] },
  { action: 'software.deploy', permitted: ['software.deploy'], denied: ['robot.control', 'work.schedule'] },
  { action: 'inventory.view', permitted: ['inventory.view'], denied: ['inventory.manage'], conditional: true },
  { action: 'inventory.view', permitted: [], denied: ['inventory.view', 'robot.control'], group: true, deny: true },
];

async function matrixUser({ expected, index, role, site }) {
  const user = await admin.enroll(`operator-${index}@example.test`, expected.group ? [] : [role.id]);

  if (expected.group) await admin.create('group', { name: 'Operators', roles: [role.id], members: [user.id] });

  if (expected.deny) {
    const denial = await admin.create('role', {
      name: 'Operator',
      rules: [{ effect: 'deny', scope: site.id, actions: ['inventory.view'] }],
    });

    await admin.update('account', user.id, { name: user.email, roles: [denial.id] });
  }

  return user;
}

async function httpVerdicts(client, expected, robot) {
  const inventory = await client.call('GET', `robot/${robot.id}`);

  expect(inventory.status).toBe(expected.permitted.includes('inventory.view') ? 200 : 403);
  expect((await client.call('GET', 'account')).status).toBe(403);
  expect((await client.call('GET', 'credentials')).status).toBe(403);

  const exported = await client.call('GET', 'export');

  expect(exported.status).toBe(expected.service || expected.permitted.includes('inventory.export') ? 200 : 403);

  if (exported.ok)
    expect((await exported.json()).items.some((item) => item.id === robot.id)).toBe(
      expected.permitted.includes('inventory.export'),
    );

  expect((await client.call('POST', `generations/${robot.id}`, {})).status).toBe(
    expected.permitted.includes('status.publish') ? 200 : 403,
  );
}

it('persists nine generated direct, group, conditional, deny and credential-ceiling configurations with independent server verdicts', async () => {
  const { allowed } = await import('../../src/fleet/service/authorization.mjs');
  const { authenticate } = await import('../../src/fleet/service/identity.mjs');
  const { readResource } = await import('../../src/fleet/service/registry.mjs');

  for (const [index, expected] of CASES.entries()) {
    const deployment = DEPLOYMENTS[index];
    const region = index === 3 ? await admin.create('region', { name: 'Retail north' }) : null;
    const site = await admin.create('site', {
      name: deployment.name,
      parent: region?.id,
      attributes: { region: 'west' },
    });
    const robot = await admin.create('robot', {
      name: 'Unit',
      parent: site.id,
      attributes: { class: deployment.class },
    });
    const rules = [
      {
        effect: 'allow',
        scope: region?.id ?? site.id,
        actions: [expected.action],
        conditions: expected.conditional ? { site: { region: ['west'] }, robot: { class: [deployment.class] } } : {},
      },
    ];
    const role = await admin.create('role', { name: 'Operator', rules });
    const user = await matrixUser({ expected, index, role, site });

    const client = expected.service ? await admin.service(rules) : user;
    const actor = await authenticate(fixture.pool, client.token);
    const resource = await readResource(fixture.pool, admin.org, robot.id);

    for (const action of expected.permitted) expect(allowed(actor, action, resource)).toBe(true);

    for (const action of expected.denied) expect(allowed(actor, action, resource)).toBe(false);

    await httpVerdicts(client, expected, robot);
    expect((await admin.result('GET', `role/${role.id}`)).rules).toEqual(rules);
    await admin.update('role', role.id, { name: 'Operator', rules });
    expect((await admin.result('GET', `role/${role.id}`)).rules).toEqual(rules);
  }
});

it('keeps enumeration bounded with duplicate names, unknown attributes and multiple pages', async () => {
  for (const kind of ['account', 'role', 'group']) {
    await fixture.pool.query(
      `INSERT INTO fleet_resources(org,id,kind,ancestors,data) SELECT $1,gen_random_uuid(),$2,ARRAY[$1::uuid],$3::jsonb FROM generate_series(1,205)`,
      [
        admin.org,
        kind,
        JSON.stringify({
          name: 'Duplicate',
          attributes: { unfamiliar: 'retained' },
          roles: [],
          members: [],
          rules: [],
        }),
      ],
    );

    const seen = new Set();
    let after = null;
    let requests = 0;
    let bytes = 0;

    do {
      const response = await admin.call('GET', `${kind}${after ? `?after=${after}` : ''}`);
      const body = await response.text();
      const page = JSON.parse(body);

      bytes += Buffer.byteLength(body);
      requests += 1;
      expect(page.items.length).toBeLessThanOrEqual(100);

      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }

      after = page.next;
    } while (after);

    expect(requests).toBe(3);
    console.log(JSON.stringify({ kind, requests, bytes, records: seen.size }));
  }
});

it('uses mapped appliance administration through signed SSO while preserving local recovery and service-token restrictions', async () => {
  const { setupRecovery } = await import('../../src/fleet/service/recovery.mjs');
  const { authRequest, responseXml, signingKey } = await import('./samlFixture.mjs');
  const { fleetClient } = await import('./fixture.mjs');
  const organization = await fixture.bootstrap(DEPLOYMENTS[9].name);
  const recovery = await setupRecovery(fixture.pool, {
    org: organization.org,
    email: 'recovery@example.test',
    password: 'recovery-password-long',
    actor: 'test:operator',
  });
  const role = await organization.create('role', {
    name: 'Appliance administrator',
    rules: [{ effect: 'allow', scope: '*', actions: ['iam.manage'], conditions: {} }],
  });
  const key = signingKey();
  const provider = await organization.create('connections', {
    name: 'Appliance SSO',
    issuer: 'https://appliance.example.test/idp',
    entryPoint: 'https://appliance.example.test/sso',
    certificates: [key.publicKey],
    mappings: [{ group: 'administrators', roles: [role.id] }],
    enabled: true,
  });

  await organization.update('federation-policy', '', { enforced: true });

  const start = await fetch(`${fixture.origin}/v1/${organization.org}/sso/${provider.id}/start`, {
    redirect: 'manual',
  });
  const request = authRequest(start.headers.get('location'));
  const xml = responseXml({ ...request, issuer: provider.issuer, key, groups: ['administrators'] });
  const response = await fetch(`${fixture.origin}/v1/${organization.org}/sso/${provider.id}/acs`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: start.headers.get('set-cookie').split(';')[0],
    },
    body: new URLSearchParams({ SAMLResponse: Buffer.from(xml).toString('base64'), RelayState: request.relay }),
  });
  const token = /fleet_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1];

  expect(response.status).toBe(303);

  const sso = fleetClient(fixture, { org: organization.org, token });

  expect((await sso.call('GET', 'account')).status).toBe(200);
  expect((await sso.call('POST', 'group', { name: 'Empty group', roles: [], members: [] })).status).toBe(200);
  expect(
    (await sso.call('POST', 'credentials', { rules: [{ effect: 'allow', scope: '*', actions: ['iam.manage'] }] }))
      .status,
  ).toBe(403);
  expect((await sso.call('DELETE', `account/${recovery.account}`)).status).toBe(403);
  expect((await sso.call('PUT', `role/${recovery.role}`, { name: 'Replaced', rules: [] })).status).toBe(403);
});

it('rejects foreign IDs and malformed edits, reevaluates live grants and revokes invitation and session material', async () => {
  const other = await fixture.bootstrap('Foreign access');
  const foreign = await other.create('role', { name: 'Operator', rules: [] });
  const site = await admin.create('site', { name: 'Road fleet' });
  const role = await admin.create('role', {
    name: 'Conditional',
    attributes: { unfamiliar: 'retained' },
    rules: [
      {
        effect: 'allow',
        scope: site.id,
        actions: ['inventory.view', 'inventory.export'],
        conditions: { robot: { unfamiliar: ['retained', 'other'] } },
      },
    ],
  });
  const robot = await admin.create('robot', {
    name: 'Road unit',
    parent: site.id,
    attributes: { unfamiliar: 'retained' },
  });
  const user = await admin.enroll('live-access@example.test', [role.id]);

  expect((await user.call('GET', `robot/${robot.id}`)).status).toBe(200);
  expect((await user.call('GET', 'export')).status).toBe(200);
  expect((await admin.call('GET', `role/${foreign.id}`)).status).toBe(403);
  expect((await admin.call('POST', 'account', { name: 'Foreign grant', roles: [foreign.id] })).status).toBe(403);
  expect(
    (
      await admin.call('POST', 'role', {
        name: 'Foreign scope',
        rules: [{ effect: 'allow', scope: foreign.id, actions: ['inventory.view'] }],
      })
    ).status,
  ).toBe(403);

  const saved = await admin.result('GET', `role/${role.id}`);

  for (const malformed of [
    { effect: 'maybe', scope: '*', actions: ['inventory.view'] },
    { effect: 'allow', scope: '*', actions: [] },
    { effect: 'allow', scope: '*', actions: ['unknown'] },
    { effect: 'allow', scope: '*', actions: ['inventory.view'], conditions: { robot: { unfamiliar: [] } } },
  ]) {
    expect((await admin.call('PUT', `role/${role.id}`, { name: 'Malformed', rules: [malformed] })).status).toBe(400);
    expect(await admin.result('GET', `role/${role.id}`)).toEqual(saved);
  }

  await admin.update('role', role.id, {
    ...saved,
    rules: [{ effect: 'allow', scope: '*', actions: ['inventory.view'], conditions: { robot: { absent: ['value'] } } }],
  });
  expect((await user.call('GET', `robot/${robot.id}`)).status).toBe(403);
  await admin.update('role', role.id, saved);
  expect((await user.call('GET', `robot/${robot.id}`)).status).toBe(200);
  await fixture.restart();
  expect((await admin.result('GET', `role/${role.id}`)).rules).toEqual(saved.rules);
  await admin.remove('credentials', user.credential);
  expect((await user.call('GET', 'role')).status).toBe(401);

  const invitation = await admin.result('POST', 'invitations', { account: user.id, email: user.email });

  await admin.remove('credentials', invitation.id);
  expect((await fixture.enroll(invitation.token, 'another-long-password')).status).toBe(401);
  expect(JSON.stringify(await admin.list('credentials'))).not.toContain(invitation.token);
});

it('returns authorized IAM summaries without rule or membership payloads and keeps full detail on demand', async () => {
  const role = await admin.create('role', {
    name: 'Summary role',
    attributes: { unknown: 'retained' },
    rules: [
      {
        effect: 'deny',
        scope: '*',
        actions: ['inventory.view'],
        conditions: { robot: { unknown: ['a\nb', 'other'] } },
      },
    ],
  });
  const page = await admin.result('GET', 'role?summary=1');

  expect(page.items.every((item) => Object.keys(item).sort().join(',') === 'id,kind,name')).toBe(true);
  expect((await admin.result('GET', `role/${role.id}`)).rules[0].conditions.robot.unknown).toEqual(['a\nb', 'other']);

  const user = await admin.enroll('summary-viewer@example.test', []);

  for (const kind of ['account', 'role', 'group', 'credentials']) {
    const response = await user.call('GET', `${kind}?summary=1`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Fleet request refused' });
  }
});

async function accessStream(client) {
  const controller = new AbortController();
  const response = await fetch(`${fixture.origin}/v1/${client.org}/subscribe?access=1`, {
    headers: { Authorization: `Bearer ${client.token}` },
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  let buffer = '';

  return {
    status: response.status,
    close: () => controller.abort(),
    async next() {
      while (!buffer.includes('\n\n')) {
        const { done, value } = await reader.read();

        if (done) throw new Error('Access stream ended');

        buffer += new TextDecoder().decode(value);
      }

      const end = buffer.indexOf('\n\n');
      const event = buffer.slice(0, end);

      buffer = buffer.slice(end + 2);

      return event;
    },
  };
}

it('keeps administration subscribed through ordinary edits and resets on revocation or loss of identity authority', async () => {
  const role = await admin.create('role', {
    name: 'Delegated administrator',
    rules: [{ effect: 'allow', scope: '*', actions: ['iam.manage'] }],
  });
  const user = await admin.enroll('watch-access@example.test', [role.id]);
  const stream = await accessStream(user);

  try {
    expect(stream.status).toBe(200);
    expect(await stream.next()).toBe('event: snapshot\ndata: {}');
    await admin.create('group', { name: 'Empty group', roles: [], members: [] });
    expect(await stream.next()).toBe('event: snapshot\ndata: {}');
    await admin.update('role', role.id, { name: 'Delegated administrator', rules: [] });
    expect(await stream.next()).toBe('event: reset\ndata: {}');
  } finally {
    stream.close();
  }

  expect((await user.call('GET', 'subscribe?access=1')).status).toBe(403);
  await admin.update('role', role.id, {
    name: 'Delegated administrator',
    rules: [{ effect: 'allow', scope: '*', actions: ['iam.manage'] }],
  });

  const revoked = await accessStream(user);

  try {
    expect(await revoked.next()).toBe('event: snapshot\ndata: {}');
    await admin.remove('credentials', user.credential);
    expect(await revoked.next()).toBe('event: reset\ndata: {}');
  } finally {
    revoked.close();
  }
});
