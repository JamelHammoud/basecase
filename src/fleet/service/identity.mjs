import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { federationRoles, localLoginAllowed } from './federationIdentity.mjs';
import { ACTIONS } from './authorization.mjs';
import { transaction } from './database.mjs';
import { auditedIdentityTransaction, lockIdentity, protectRecovery } from './recoveryProtection.mjs';
import { identifier, insist, rules, text } from './validation.mjs';

const derive = promisify(scrypt);

export const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  text(password, 1024);
  insist(password.length >= 14);

  return `${salt}:${Buffer.from(await derive(password, salt, 64)).toString('hex')}`;
}

export async function matchesPassword(password, stored) {
  const [salt] = stored.split(':');
  const actual = await passwordHash(password, salt);

  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}

export async function issueCredential(client, options) {
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const expires = new Date(Date.now() + options.duration);

  await client.query(
    'INSERT INTO fleet_credentials(hash,id,org,account,kind,ceiling,expires,connection) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      hash(token),
      id,
      options.org,
      options.account,
      options.kind,
      options.ceiling ? JSON.stringify(options.ceiling) : null,
      expires,
      options.connection ?? null,
    ],
  );

  return { token, id, expires: expires.toISOString() };
}

export async function bootstrap(pool, options) {
  const org = randomUUID();
  const account = randomUUID();
  const role = randomUUID();
  const password = await passwordHash(options.password);

  await transaction(pool, async (client) => {
    await client.query('INSERT INTO fleet_organizations(id,name) VALUES ($1,$2)', [org, text(options.name)]);
    await client.query('INSERT INTO fleet_resources(org,id,kind,ancestors,data) VALUES ($1,$2,$3,$4,$5)', [
      org,
      role,
      'role',
      [org],
      { name: 'Administrator', rules: [{ effect: 'allow', scope: '*', actions: ACTIONS, conditions: {} }] },
    ]);
    await client.query('INSERT INTO fleet_resources(org,id,kind,ancestors,data) VALUES ($1,$2,$3,$4,$5)', [
      org,
      account,
      'account',
      [org],
      { name: text(options.email), roles: [role] },
    ]);
    await client.query('INSERT INTO fleet_passwords(org,account,email,password) VALUES ($1,$2,$3,$4)', [
      org,
      account,
      options.email.toLowerCase(),
      password,
    ]);
  });

  return { org, account };
}

export async function login(pool, body) {
  const org = identifier(body.org);
  const email = text(body.email).toLowerCase();

  const result = await pool.query('SELECT account,password FROM fleet_passwords WHERE org=$1 AND email=$2', [
    org,
    email,
  ]);
  const found = result.rows[0];

  insist(found?.password && (await matchesPassword(text(body.password, 1024), found.password)), 401);

  return transaction(pool, async (client) => {
    await lockIdentity(client, org);

    const current = await client.query('SELECT password FROM fleet_passwords WHERE org=$1 AND account=$2', [
      org,
      found.account,
    ]);

    insist(current.rows[0]?.password === found.password, 401);

    await localLoginAllowed(client, org, found.account);

    return issueCredential(client, { org, account: found.account, kind: 'session', duration: 12 * 3600000 });
  });
}

export async function enroll(pool, body) {
  const tokenHash = hash(text(body.token));
  const password = await passwordHash(body.password);

  return auditedIdentityTransaction(pool, async (client) => {
    const candidate = await client.query(
      "SELECT org,account FROM fleet_credentials WHERE hash=$1 AND kind='enrollment'",
      [tokenHash],
    );

    insist(candidate.rows[0], 401);
    await protectRecovery(
      client,
      { org: candidate.rows[0].org, account: candidate.rows[0].account },
      { id: candidate.rows[0].account, action: 'recovery.password.enroll' },
    );

    const result = await client.query(
      "DELETE FROM fleet_credentials WHERE hash=$1 AND kind='enrollment' AND expires>now() RETURNING org,account",
      [tokenHash],
    );
    const found = result.rows[0];

    insist(found, 401);
    await localLoginAllowed(client, found.org, found.account);
    await client.query('UPDATE fleet_passwords SET password=$3 WHERE org=$1 AND account=$2', [
      found.org,
      found.account,
      password,
    ]);

    return issueCredential(client, { ...found, kind: 'session', duration: 12 * 3600000 });
  });
}

export async function invite(client, actor, body) {
  const org = actor.org;
  const account = identifier(body.account);
  const email = text(body.email).toLowerCase();

  await protectRecovery(client, actor, { id: account, action: 'recovery.password.invite' });

  const exists = await client.query("SELECT 1 FROM fleet_resources WHERE org=$1 AND id=$2 AND kind='account'", [
    org,
    account,
  ]);

  insist(exists.rowCount === 1);
  await client.query(
    'INSERT INTO fleet_passwords(org,account,email) VALUES ($1,$2,$3) ON CONFLICT (org,account) DO UPDATE SET email=EXCLUDED.email',
    [org, account, email],
  );

  return issueCredential(client, { org, account, kind: 'enrollment', duration: 86400000 });
}

export async function authenticate(pool, token) {
  insist(typeof token === 'string' && token.length <= 256, 401);

  const result = await pool.query(
    "SELECT c.*,r.data FROM fleet_credentials c JOIN fleet_resources r ON r.org=c.org AND r.id=c.account WHERE c.hash=$1 AND c.expires>now() AND c.kind<>'enrollment'",
    [hash(token)],
  );
  const credential = result.rows[0];

  insist(credential, 401);

  const federatedRoles = await federationRoles(pool, credential);

  const groups = await pool.query(
    "SELECT data FROM fleet_resources WHERE org=$1 AND kind='group' AND data->'members' ? $2 LIMIT 101",
    [credential.org, credential.account],
  );

  insist(groups.rowCount <= 100, 403);

  const roles = [
    ...new Set([
      ...(credential.data.roles ?? []),
      ...federatedRoles,
      ...groups.rows.flatMap((item) => item.data.roles),
    ]),
  ];

  insist(roles.length <= 256, 403);

  const found = await pool.query(
    "SELECT data FROM fleet_resources WHERE org=$1 AND kind='role' AND id=ANY($2::uuid[])",
    [credential.org, roles],
  );

  return {
    org: credential.org,
    account: credential.account,
    credential: credential.id,
    rules: found.rows.flatMap((item) => item.data.rules),
    ceiling: credential.ceiling,
    connection: credential.connection,
  };
}

export async function serviceCredential(client, actor, body) {
  insist(!actor.connection, 403);

  return issueCredential(client, {
    org: actor.org,
    account: actor.account,
    kind: 'service',
    ceiling: rules(body.rules),
    duration: 30 * 86400000,
  });
}
