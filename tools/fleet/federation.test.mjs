import { afterAll, beforeAll, expect, it } from 'vitest';
import { startService } from '../../src/fleet/service/http.mjs';
import { freePort } from './postgres.mjs';
import { fleetFixture, fleetClient } from './fixture.mjs';
import { recover, setupRecovery } from '../../src/fleet/service/recovery.mjs';
import { authRequest, responseXml, signingKey } from './samlFixture.mjs';

let fixture;
let admin;
let site;
let role;
let recovery;
const firstKey = signingKey();
const secondKey = signingKey();

beforeAll(async () => {
  fixture = await fleetFixture();
  admin = await fixture.bootstrap('Federation');
  recovery = await setupRecovery(fixture.pool, {
    org: admin.org,
    email: 'recovery@example.test',
    password: 'local-recovery-password',
    actor: 'test:operator',
  });
  await admin.enroll('same@example.test', []);
  site = await admin.create('site', { name: 'Ward' });
  role = await admin.create('role', {
    name: 'Ward viewer',
    rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'] }],
  });
});
afterAll(async () => fixture?.close());

async function connection(name, key = firstKey) {
  return admin.create('connections', {
    name,
    issuer: `https://${name}.example.test/idp`,
    entryPoint: `https://${name}.example.test/sso`,
    certificates: [key.publicKey],
    mappings: [{ group: 'ward', roles: [role.id] }],
    enabled: true,
  });
}

async function exchange(provider, options = {}) {
  const start =
    options.start ??
    (await fetch(`${fixture.origin}/v1/${admin.org}/sso/${provider.id}/start`, { redirect: 'manual' }));
  const request = authRequest(start.headers.get('location'));
  const xml = responseXml({ ...request, issuer: provider.issuer, key: options.key ?? firstKey, ...options });
  const send = () =>
    fetch(`${fixture.origin}/v1/${admin.org}/sso/${provider.id}/acs`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: start.headers.get('set-cookie').split(';')[0],
      },
      body: new URLSearchParams({
        SAMLResponse: Buffer.from(options.transform ? options.transform(xml) : xml).toString('base64'),
        RelayState: request.relay,
      }),
    });
  const response = await send();
  const token = /fleet_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1];

  return { response, send, token, client: token && fleetClient(fixture, { org: admin.org, token }) };
}

it('isolates subsidiaries and partners with identical emails and subject IDs and scopes discovery to one organization', async () => {
  const providers = await Promise.all(['subsidiary-a', 'subsidiary-b', 'partner'].map((name) => connection(name)));
  const sessions = [];

  for (const provider of providers) {
    const result = await exchange(provider);

    expect(result.response.status).toBe(303);
    sessions.push(
      await (await fetch(`${fixture.origin}/v1/me`, { headers: { Authorization: `Bearer ${result.token}` } })).json(),
    );
    expect((await result.client.list('site')).items.map((item) => item.id)).toEqual([site.id]);
    expect((await result.client.call('POST', 'roles', {})).ok).toBe(false);
  }

  expect(new Set(sessions.map((item) => item.account)).size).toBe(3);

  const other = await fixture.bootstrap('Other');
  const discovery = await (await fixture.anonymous(`/${other.org}/sso`)).json();

  expect(discovery.items).toEqual([]);
});

it('applies group grants and removal, rollover and disabling without linking local email accounts', async () => {
  const provider = await connection('rollover');
  const first = await exchange(provider);

  expect(first.response.status).toBe(303);
  expect((await first.client.list('site')).items).toHaveLength(1);
  await admin.update('connections', provider.id, {
    ...provider,
    certificates: [firstKey.publicKey, secondKey.publicKey],
  });
  expect((await exchange(provider, { key: secondKey })).response.status).toBe(303);
  await admin.update('connections', provider.id, { ...provider, certificates: [secondKey.publicKey] });
  expect((await exchange(provider)).response.status).toBe(400);

  const removed = await exchange(provider, { key: secondKey, groups: [] });

  expect((await removed.client.list('site')).items).toEqual([]);
  await admin.update('connections', provider.id, { ...provider, enabled: false });
  expect((await removed.client.call('GET', 'site')).status).toBe(401);
  expect((await fixture.anonymous(`/${admin.org}/sso/${provider.id}/start`)).status).toBe(403);
});

it('preserves live inventory on repeated SSO and resets it when asserted grants change', async () => {
  const provider = await connection('repeat-session');
  const robot = await admin.create('robot', { name: 'Repeat-session robot', parent: site.id });
  const session = await exchange(provider);
  const subscription = await session.client.subscribe();

  try {
    expect((await subscription.next()).event).toBe('snapshot');
    expect((await exchange(provider, { groups: ['ward', 'ward'] })).response.status).toBe(303);
    await admin.generation(robot.id);
    expect((await subscription.next()).event).toBe('snapshot');
    expect((await exchange(provider, { groups: [] })).response.status).toBe(303);
    expect((await subscription.next()).event).toBe('reset');
    expect((await session.client.list('site')).items).toEqual([]);
  } finally {
    await subscription.close();
  }
});

it('rejects replay, expiration, audience and recipient confusion and forged signatures', async () => {
  const provider = await connection('exploits');
  const maliciousStart = await fetch(`${fixture.origin}/v1/${admin.org}/sso/${provider.id}/start`, {
    redirect: 'manual',
    headers: { Origin: 'https://attacker.example.test' },
  });

  expect(maliciousStart.status).toBe(403);

  const valid = await exchange(provider);

  expect(valid.response.status).toBe(303);
  expect((await valid.send()).status).toBe(400);

  const otherFlow = await fetch(`${fixture.origin}/v1/${admin.org}/sso/${provider.id}/start`, {
    redirect: 'manual',
  });
  const otherRequest = authRequest(otherFlow.headers.get('location'));

  expect((await exchange(provider, { request: otherRequest.request })).response.status).toBe(400);
  expect((await exchange(provider, { start: otherFlow })).response.status).toBe(303);

  for (const options of [
    { expiry: -60000 },
    { audience: 'wrong' },
    { recipient: 'https://wrong.test/acs' },
    { key: secondKey },
    { request: '_unknown-request' },
    { issuer: 'https://foreign.test/idp' },
    { transform: (xml) => '<!DOCTYPE samlp:Response [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' + xml },
    {
      transform: (xml) =>
        xml.replace(
          '</samlp:Response>',
          '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_wrapped"/></samlp:Response>',
        ),
    },
  ]) {
    expect((await exchange(provider, options)).response.status).toBe(400);
  }
});

it('refuses unsafe metadata, foreign roles and mapping to the protected recovery identity', async () => {
  const provider = await connection('unsafe');
  const other = await fixture.bootstrap('Foreign');
  const foreignRole = await other.create('role', { name: 'Foreign viewer', rules: [] });

  for (const change of [
    { metadataUrl: 'http://169.254.169.254/' },
    { entryPoint: 'javascript:alert(1)' },
    { mappings: [{ group: 'ward', roles: [foreignRole.id] }] },
    { mappings: [{ group: 'ward', roles: [recovery.role] }] },
  ]) {
    expect((await admin.call('PUT', `connections/${provider.id}`, { ...provider, ...change })).ok).toBe(false);
  }
});

it('SCIM deactivation revokes live subscriptions and all credentials while another tenant keeps access', async () => {
  const provider = await connection('scim');
  const credential = await admin.create(`connections/${provider.id}/scim-token`, {});

  expect((await fleetClient(fixture, { org: admin.org, token: credential.token }).call('GET', 'site')).status).toBe(
    401,
  );

  const scim = (method, path, body) =>
    fetch(`${fixture.origin}/scim/v2/${admin.org}/${provider.id}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/scim+json' },
      body: body && JSON.stringify(body),
    });
  const created = await scim('POST', 'Users', {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    externalId: 'same-subject',
    userName: 'same@example.test',
    active: true,
  });
  const user = await created.json();

  expect(created.status).toBe(201);

  const group = await scim('POST', 'Groups', {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    externalId: 'ward',
    displayName: 'Ward',
    members: [{ value: user.id }],
  });

  expect(group.status).toBe(201);

  const session = await exchange(provider);
  const groupRecord = await group.json();
  const removeMembers = await scim('PATCH', `Groups/${groupRecord.id}`, {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
    Operations: [{ op: 'replace', path: 'members', value: [] }],
  });

  expect(removeMembers.status).toBe(200);
  expect((await session.client.list('site')).items).toEqual([]);
  expect(
    (
      await scim('PATCH', `Groups/${groupRecord.id}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'members', value: [{ value: user.id }] }],
      })
    ).status,
  ).toBe(200);
  expect((await session.client.list('site')).items).toHaveLength(1);

  const subscription = await session.client.subscribe();

  expect((await subscription.next()).event).toBe('snapshot');
  expect(
    (
      await scim('PATCH', `Users/${user.id}`, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      })
    ).status,
  ).toBe(200);
  expect((await subscription.next()).event).toBe('reset');
  expect((await session.client.call('GET', 'site')).status).toBe(401);
  expect((await exchange(provider)).response.status).toBe(400);
  expect((await scim('GET', '../wrong/Users')).ok).toBe(false);
  expect((await admin.call('GET', 'site')).ok).toBe(true);
  await subscription.close();
  expect((await scim('DELETE', `Users/${user.id}`)).status).toBe(204);
  expect((await scim('GET', `Users/${user.id}`)).status).toBe(404);
  expect((await exchange(provider)).response.status).toBe(400);
  expect(
    (await scim('POST', 'Users', { externalId: 'same-subject', userName: 'same@example.test', active: true })).status,
  ).toBe(201);
  expect((await (await exchange(provider)).client.list('site')).items).toEqual([]);
});

it('rejects queued authority after SCIM commits and prevents SSO from issuing robot publisher credentials', async () => {
  const provider = await connection('queued-authority');
  const administrator = (await admin.list('role')).items.find((item) => item.name === 'Administrator');

  await admin.update('connections', provider.id, {
    ...provider,
    mappings: [{ group: 'ward', roles: [administrator.id] }],
  });

  const session = await exchange(provider);

  expect((await session.client.call('GET', 'account')).status).toBe(200);

  const identity = await fixture.pool.query('SELECT account FROM fleet_federated WHERE org=$1 AND connection=$2', [
    admin.org,
    provider.id,
  ]);
  const invitation = await admin.create('invitations', {
    account: identity.rows[0].account,
    email: 'federated-enrollment@example.test',
  });

  expect((await fixture.enroll(invitation.token, 'federated-local-password')).status).toBe(401);
  expect(
    (
      await session.client.call('POST', 'credentials', {
        rules: [{ effect: 'allow', actions: ['status.publish'], scope: '*' }],
      })
    ).status,
  ).toBe(403);

  const credential = await admin.create(`connections/${provider.id}/scim-token`, {});
  let release;
  let observed;
  const resume = new Promise((resolve) => {
    release = resolve;
  });
  const captured = new Promise((resolve) => {
    observed = resolve;
  });
  let remaining = 2;
  const recordCapture = () => {
    remaining -= 1;

    if (!remaining) observed();
  };
  const pool = {
    connect: fixture.pool.connect.bind(fixture.pool),
    async query(sql, args) {
      const result = await fixture.pool.query(sql, args);

      if (remaining > 0 && sql.startsWith('SELECT data FROM fleet_resources')) {
        recordCapture();
        await resume;
      }

      return result;
    },
  };
  const origin = `http://127.0.0.1:${await freePort()}`;
  const service = await startService({ pool, origin });

  try {
    const queued = fetch(`${origin}/v1/${admin.org}/site`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Revoked queued site' }),
    });

    const queuedSubscription = fetch(`${origin}/v1/${admin.org}/subscribe`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    await captured;

    const deactivated = await fetch(`${fixture.origin}/scim/v2/${admin.org}/${provider.id}/Users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/scim+json' },
      body: JSON.stringify({ externalId: 'same-subject', userName: 'same@example.test', active: false }),
    });

    expect(deactivated.status).toBe(201);
    release();
    expect((await queued).status).toBe(401);
    expect((await queuedSubscription).status).toBe(401);
    expect((await admin.list('site')).items.some((item) => item.name === 'Revoked queued site')).toBe(false);
  } finally {
    release();
    await service.close();
  }
});

it('keeps password recovery and other tenants usable under enforcement and revokes provisioning authority on recovery', async () => {
  const other = await fixture.bootstrap('Unenforced');
  const provider = await connection('recovery-enforced');
  const credential = await admin.create(`connections/${provider.id}/scim-token`, {});
  const scim = (suffix, body) =>
    fetch(`${fixture.origin}/scim/v2/${admin.org}/${provider.id}/${suffix}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/scim+json' },
      body: JSON.stringify(body),
    });
  const refusal = await scim(`Users/${recovery.account}`, {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
    Operations: [{ op: 'replace', path: 'active', value: false }],
  });

  expect(refusal.status).toBe(403);
  expect((await admin.call('PUT', 'federation-policy', { enforced: true })).status).toBe(200);

  const login = (email, password) =>
    fetch(`${fixture.origin}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: admin.org, email, password }),
    });

  expect((await login(admin.email, 'fleet-fixture-password')).status).toBe(401);

  const recoveryLogin = await login('recovery@example.test', 'local-recovery-password');

  expect(recoveryLogin.status).toBe(200);

  const local = fleetClient(fixture, { org: admin.org, token: (await recoveryLogin.json()).token });
  const account = await local.create('account', { name: 'Enforced local', roles: [] });
  const invitation = await local.create('invitations', { account: account.id, email: 'enforced@example.test' });

  expect((await fixture.enroll(invitation.token, 'enforced-local-password')).status).toBe(401);
  expect((await other.call('GET', 'site')).status).toBe(200);
  expect((await exchange(provider, { groups: ['Administrator', role.id] })).response.status).toBe(303);
  expect(
    (await (await exchange(provider, { groups: ['Administrator', role.id] })).client.call('GET', 'account')).status,
  ).toBe(403);
  await recover(fixture.pool, { org: admin.org, password: 'rotated-recovery-password', actor: 'test:operator' });
  expect((await scim('Users', {})).status).toBe(401);
  expect((await login('recovery@example.test', 'rotated-recovery-password')).status).toBe(200);
  expect((await other.call('GET', 'site')).status).toBe(200);
});
