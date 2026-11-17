import { createPublicKey, randomBytes, randomUUID } from 'node:crypto';
import { demand, organization } from './registry.mjs';
import { protectRecovery } from './recoveryProtection.mjs';
import { hash } from './identity.mjs';
import { identifier, ids, insist, text } from './validation.mjs';

function endpoint(value) {
  const url = new URL(text(value, 2048));

  insist(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)));
  insist(!url.username && !url.password && !url.hash);

  return url.href;
}

function certificate(value) {
  const pem = text(value, 16384);

  insist(/^-----BEGIN (CERTIFICATE|PUBLIC KEY)-----[\s\S]+-----END \1-----\s*$/.test(pem));

  const key = createPublicKey(pem);

  insist(key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength >= 2048);

  return pem;
}

async function configuration(client, actor, body) {
  insist(!('metadataUrl' in body) && !('metadata' in body));
  insist(typeof body.enabled === 'boolean');
  insist(Array.isArray(body.certificates) && body.certificates.length >= 1 && body.certificates.length <= 3);
  insist(Array.isArray(body.mappings) && body.mappings.length <= 32);

  const mappings = [];

  for (const mapping of body.mappings) {
    const roles = ids(mapping.roles);

    insist(roles.length <= 8);
    await protectRecovery(client, actor, { data: { roles }, action: 'recovery.federation.mapping' });

    const result = await client.query(
      "SELECT id FROM fleet_resources WHERE org=$1 AND kind='role' AND id=ANY($2::uuid[])",
      [actor.org, roles],
    );

    insist(result.rowCount === roles.length);
    mappings.push({ group: text(mapping.group), roles });
  }

  return {
    name: text(body.name),
    issuer: text(body.issuer, 2048),
    entryPoint: endpoint(body.entryPoint),
    certificates: body.certificates.map(certificate),
    mappings,
    enabled: body.enabled,
  };
}

export async function connectionFor(client, org, id, enabled = true) {
  const result = await client.query('SELECT * FROM fleet_connections WHERE org=$1 AND id=$2', [
    identifier(org),
    identifier(id),
  ]);
  const row = result.rows[0];

  insist(row && (!enabled || row.data.enabled), 403);

  return row;
}

export async function federationAdmin(client, actor, options) {
  demand(actor, 'iam.manage', organization(actor.org));

  const { parts, method, body } = options;
  const [, id, action] = parts;

  if (parts[0] === 'federation-policy') return policy(client, actor, method, body);

  if (method === 'GET' && !id) {
    const result = await client.query('SELECT id,data FROM fleet_connections WHERE org=$1 ORDER BY id LIMIT 32', [
      actor.org,
    ]);

    return { items: result.rows.map((row) => ({ id: row.id, ...row.data })) };
  }

  if (method === 'POST' && action === 'scim-token') {
    await connectionFor(client, actor.org, id);

    const token = randomBytes(32).toString('base64url');

    await client.query(
      "INSERT INTO fleet_scim_tokens(org,connection,hash,expires) VALUES ($1,$2,$3,now()+interval '30 days') ON CONFLICT (org,connection) DO UPDATE SET hash=EXCLUDED.hash,expires=EXCLUDED.expires",
      [actor.org, id, hash(token)],
    );

    return { token };
  }

  insist(!action && ['POST', 'PUT'].includes(method), 404);

  return saveConnection(client, actor, { id, body, method });
}

async function saveConnection(client, actor, { id, body, method }) {
  const data = await configuration(client, actor, body);
  const connection = id ? await connectionFor(client, actor.org, id, false) : null;

  insist(method === 'PUT' ? connection : !id);
  insist(!connection || connection.issuer === data.issuer);

  const count = await client.query('SELECT count(*) FROM fleet_connections WHERE org=$1', [actor.org]);

  insist(connection || Number(count.rows[0].count) < 32);

  const key = id ?? randomUUID();

  await client.query(
    'INSERT INTO fleet_connections(org,id,issuer,revision,data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org,id) DO UPDATE SET data=EXCLUDED.data,revision=EXCLUDED.revision',
    [actor.org, key, data.issuer, randomUUID(), data],
  );
  await client.query('DELETE FROM fleet_saml_cache WHERE org=$1 AND connection=$2', [actor.org, key]);
  await client.query('DELETE FROM fleet_credentials WHERE org=$1 AND connection=$2', [actor.org, key]);

  return { id: key, ...data };
}

async function policy(client, actor, method, body) {
  if (method === 'GET') {
    const result = await client.query('SELECT enforced FROM fleet_federation_policy WHERE org=$1', [actor.org]);

    return { enforced: result.rows[0]?.enforced ?? false };
  }

  insist(method === 'PUT' && typeof body.enforced === 'boolean');

  const recovery = await client.query('SELECT 1 FROM fleet_recovery WHERE org=$1', [actor.org]);

  insist(!body.enforced || recovery.rowCount === 1);
  await client.query(
    'INSERT INTO fleet_federation_policy(org,enforced) VALUES ($1,$2) ON CONFLICT (org) DO UPDATE SET enforced=EXCLUDED.enforced',
    [actor.org, body.enforced],
  );
  await client.query(
    'DELETE FROM fleet_credentials WHERE org=$1 AND connection IS NULL AND account NOT IN (SELECT id FROM fleet_recovery WHERE org=$1)',
    [actor.org],
  );

  return { enforced: body.enforced };
}
