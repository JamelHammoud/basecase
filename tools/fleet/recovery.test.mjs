import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fleetClient, fleetFixture } from './fixture.mjs';
import { recoveryCommand } from './recoveryCommand.mjs';
import { readRecoveryAudit, recover, setupRecovery } from '../../src/fleet/service/recovery.mjs';
import { transaction } from '../../src/fleet/service/database.mjs';

let fixture;
const password = 'recovery-password-first';
const rotated = 'recovery-password-rotated';
const email = 'recovery@example.test';
const operator = 'test:local-operator';
const setup = (org) => setupRecovery(fixture.pool, { org, email, password, actor: operator });
const recoverOrg = (org) => recover(fixture.pool, { org, password: rotated, actor: operator });

beforeAll(async () => {
  fixture = await fleetFixture();
});
afterAll(async () => fixture?.close());

async function signIn(org, secret = rotated) {
  const response = await fetch(`${fixture.origin}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org, email, password: secret }),
  });

  return { status: response.status, ...(await response.json()) };
}

async function recovered(org) {
  const session = await signIn(org);

  expect(session.status).toBe(200);

  return fleetClient(fixture, { org, id: session.account, token: session.token });
}

it('recovers lost passwords without changing inventory or assets', async () => {
  const admin = await fixture.bootstrap('Password loss');

  const site = await admin.create('site', { name: 'Original site' });
  const robot = await admin.create('robot', { name: 'Original robot', parent: site.id });
  const asset = await admin.create('asset', { name: 'Manual', parent: robot.id, content: 'Keep this' });
  const service = await admin.service([{ effect: 'allow', scope: '*', actions: ['inventory.view'] }]);
  const pending = await admin.create('account', { name: 'Pending', roles: [] });
  const invitation = await admin.result('POST', 'invitations', { account: pending.id, email: 'pending@example.test' });
  const stream = await admin.subscribe();

  await stream.next();

  const local = await setup(admin.org);

  await recoverOrg(admin.org);
  expect((await stream.next()).event).toBe('reset');
  await stream.close();
  expect((await admin.call('GET', 'robot')).status).toBe(401);
  expect((await service.call('GET', 'robot')).status).toBe(401);
  expect((await fixture.enroll(invitation.token, rotated)).status).toBe(401);
  expect((await signIn(admin.org, password)).status).toBe(401);

  const user = await recovered(admin.org);

  expect((await user.list('robot')).items.map((item) => item.id)).toEqual([robot.id]);
  expect(await user.result('GET', `asset/${asset.id}/content`)).toMatchObject({ content: 'Keep this' });
  expect((await fixture.pool.query('SELECT id FROM fleet_recovery WHERE org=$1', [admin.org])).rows[0].id).toBe(
    local.account,
  );
});

it.each(['stripped', 'viewer', 'deleted'])('recovers when ordinary administrators are %s', async (loss) => {
  const admin = await fixture.bootstrap(`Administrator ${loss}`);

  if (loss === 'deleted') await admin.remove('account', admin.id);

  if (loss === 'stripped') await admin.update('account', admin.id, { name: 'Former administrator', roles: [] });

  if (loss === 'viewer') {
    const site = await admin.create('site', { name: 'Only site' });
    const role = await admin.create('role', {
      name: 'Viewer',
      rules: [{ effect: 'allow', scope: site.id, actions: ['inventory.view'] }],
    });

    await admin.update('account', admin.id, { name: 'Viewer', roles: [role.id] });
  }

  const local = await setup(admin.org);

  expect((await admin.call('POST', 'account', { name: 'Cannot administer' })).status).not.toBe(200);
  await recoverOrg(admin.org);

  const user = await recovered(admin.org);

  expect((await user.create('account', { name: 'Restored access', roles: [] })).org).toBe(admin.org);
  expect(local.org).toBe(admin.org);
});

it('serializes concurrent removal attempts and protects account, role, group and password paths with durable refusals', async () => {
  const admin = await fixture.bootstrap('Protection');
  const local = await setup(admin.org);
  const attempts = [
    () => admin.call('DELETE', `account/${local.account}`),
    () => admin.call('PUT', `account/${local.account}`, { name: 'Deprovisioned', roles: [] }),
    () => admin.call('DELETE', `role/${local.role}`),
    () => admin.call('PUT', `role/${local.role}`, { name: 'Stripped', rules: [] }),
    () => admin.call('POST', 'group', { name: 'Deny injection', members: [local.account], roles: [] }),
    () => admin.call('POST', 'invitations', { account: local.account, email: 'takeover@example.test' }),
  ];
  const responses = await Promise.all(attempts.map((attempt) => attempt()));

  expect(responses.map((response) => response.status)).toEqual(attempts.map(() => 403));

  const group = await admin.create('group', { name: 'Ordinary', roles: [], members: [] });

  expect((await admin.call('PUT', `group/${group.id}`, { name: 'Injected', members: [local.account] })).status).toBe(
    403,
  );
  expect((await signIn(admin.org, password)).status).toBe(200);

  const audit = await fixture.pool.query('SELECT * FROM fleet_recovery_audit WHERE org=$1 ORDER BY sequence', [
    admin.org,
  ]);

  expect(audit.rows.filter((row) => row.outcome === 'refused')).toHaveLength(7);
  expect(
    audit.rows.filter((row) => row.outcome === 'refused').every((row) => row.actor === `account:${admin.id}`),
  ).toBe(true);
  expect(audit.rows.every((row) => row.affected && row.occurred_at && row.action)).toBe(true);
});

it('keeps ordinary roles customizable and explicit denies authoritative', async () => {
  const admin = await fixture.bootstrap('Denies');

  await setup(admin.org);

  const role = await admin.create('role', {
    name: 'Custom',
    rules: [
      { effect: 'allow', scope: '*', actions: ['iam.manage', 'inventory.view'] },
      { effect: 'deny', scope: '*', actions: ['iam.manage'] },
    ],
  });
  const user = await admin.enroll('denied@example.test', [role.id]);

  expect((await user.call('DELETE', `account/${admin.id}`)).status).toBe(403);
  await admin.update('role', role.id, { name: 'Changed freely', rules: [] });
  await admin.remove('role', role.id);
});

it('refuses wrong organizations, cross-tenant references and forged remote recovery', async () => {
  const admin = await fixture.bootstrap('Tenant one');
  const other = await fixture.bootstrap('Tenant two');
  const local = await setup(admin.org);

  await expect(recoverOrg(other.org)).rejects.toThrow();
  await expect(recoverOrg(randomUUID())).rejects.toThrow();
  expect((await signIn(other.org, password)).status).toBe(401);
  expect((await other.call('POST', 'group', { name: 'Foreign', members: [local.account] })).status).toBe(403);

  for (const route of ['recover', 'recovery-setup', 'recovery-audit']) {
    expect((await admin.call('POST', route, { password, account: local.account })).status).toBe(404);
  }
});

it('rolls back an interrupted recovery including password, revocation and successful audit', async () => {
  const admin = await fixture.bootstrap('Interrupted');

  await setup(admin.org);
  await fixture.pool.query(
    `CREATE FUNCTION reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'interrupted'; END $$`,
  );
  await fixture.pool.query(
    `CREATE TRIGGER reject_recovery BEFORE INSERT ON fleet_recovery_audit FOR EACH ROW WHEN (NEW.action='recovery.use') EXECUTE FUNCTION reject_recovery_audit()`,
  );

  try {
    await expect(recoverOrg(admin.org)).rejects.toThrow();
    expect((await admin.call('GET', 'robot')).status).toBe(200);
    expect((await signIn(admin.org, password)).status).toBe(200);
    expect((await signIn(admin.org)).status).toBe(401);
    expect(
      (
        await fixture.pool.query("SELECT 1 FROM fleet_recovery_audit WHERE org=$1 AND action='recovery.use'", [
          admin.org,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await fixture.pool.query('DROP TRIGGER reject_recovery ON fleet_recovery_audit');
    await fixture.pool.query('DROP FUNCTION reject_recovery_audit()');
  }

  await expect(
    transaction(fixture.pool, async (client) => {
      await client.query('SELECT id FROM fleet_organizations WHERE id=$1 FOR UPDATE', [admin.org]);

      throw new Error('Disconnected before mutation');
    }),
  ).rejects.toThrow();
});

it('runs the exact local command, rotates repeatedly, bounds input and retains secret-free audit through restart', async () => {
  const admin = await fixture.bootstrap('Command');
  const results = [];
  const run = async (command, input) => {
    const result = await recoveryCommand(fixture.databaseUrl, command, admin.org, input);

    results.push(result);

    return result;
  };
  const initial = await run('recovery-setup', { email, password });

  expect(initial.code).toBe(0);
  expect((await run('recovery-setup', { email, password })).code).toBe(1);
  expect((await run('recover', { password: rotated })).code).toBe(0);
  expect((await run('recover', { password: rotated })).code).toBe(1);

  const old = await signIn(admin.org);

  expect(old.status).toBe(200);
  expect((await run('recover', { password })).code).toBe(0);
  expect((await signIn(admin.org)).status).toBe(401);
  expect((await fleetClient(fixture, { org: admin.org, token: old.token }).call('GET', 'robot')).status).toBe(401);
  expect((await fixture.enroll('reused-recovery-material', password)).status).toBe(401);
  expect((await run('recover', { password: 'short' })).code).toBe(1);
  expect((await run('recover', { password: 'x'.repeat(9000) })).code).toBe(1);
  expect((await run('recover', undefined)).code).toBe(1);
  await fixture.restart();
  expect((await signIn(admin.org, password)).status).toBe(200);

  const records = await run('recovery-audit');
  const output = results.map((result) => result.stdout + result.stderr).join('');

  expect(records.code).toBe(0);
  expect(
    JSON.parse(records.stdout).items.filter((row) => row.action === 'recovery.use' && row.outcome === 'success'),
  ).toHaveLength(2);
  expect(JSON.parse(records.stdout).items.every((row) => row.actor.startsWith('local:'))).toBe(true);

  for (const secret of [password, rotated, old.token]) expect(output).not.toContain(secret);

  await fixture.pool.query(
    "INSERT INTO fleet_recovery_audit(org,actor,action,affected,outcome) SELECT $1,$2,'recovery.use',$3,'refused' FROM generate_series(1,105)",
    [admin.org, operator, admin.id],
  );

  const first = await readRecoveryAudit(fixture.pool, admin.org);
  const next = await readRecoveryAudit(fixture.pool, admin.org, first.next);

  expect(first.items).toHaveLength(100);
  expect(next.items.length).toBeGreaterThan(5);
  expect(next.next).toBeNull();
  expect(new Set([...first.items, ...next.items].map((row) => row.sequence)).size).toBe(100 + next.items.length);
  expect([...first.items, ...next.items].every((row) => row.org === admin.org)).toBe(true);
  await expect(readRecoveryAudit(fixture.pool, admin.org, '-1')).rejects.toThrow();
});
