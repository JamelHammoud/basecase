import { randomUUID } from 'node:crypto';
import { hash } from './identity.mjs';
import { connectionFor } from './federationConfig.mjs';
import { federatedAccount } from './federationIdentity.mjs';
import { auditedIdentityTransaction, lockIdentity, protectRecovery } from './recoveryProtection.mjs';
import { identifier, ids, insist, text } from './validation.mjs';

const CORE = 'urn:ietf:params:scim:schemas:core:2.0:';
const MESSAGE = 'urn:ietf:params:scim:api:messages:2.0:';
const userView = (row) => ({
  schemas: [`${CORE}User`],
  id: row.account,
  externalId: row.subject,
  userName: row.data.name,
  active: row.active,
});
const groupView = (row) => ({
  schemas: [`${CORE}Group`],
  id: row.id,
  externalId: row.external_id,
  displayName: row.name,
  members: row.members.map((value) => ({ value })),
});

async function authorize(client, options) {
  const { org, connection, token } = options;
  const result = await client.query(
    'SELECT 1 FROM fleet_scim_tokens WHERE org=$1 AND connection=$2 AND hash=$3 AND expires>now()',
    [org, connection, hash(text(token, 256))],
  );

  insist(result.rowCount === 1, 401);

  return connectionFor(client, org, connection);
}

export async function scimRequest(pool, options) {
  return auditedIdentityTransaction(pool, async (client) => {
    identifier(options.org);
    identifier(options.connection);
    await lockIdentity(client, options.org);

    const connection = await authorize(client, options);
    const { kind, id, method, query, body } = options;

    insist(['Users', 'Groups'].includes(kind), 404);

    if (id) identifier(id);

    if (method === 'GET') return listOrRead(client, connection, { kind, id, query });

    const actor = { org: connection.org, account: connection.id };

    if (id) await protectRecovery(client, actor, { id, action: 'recovery.scim.mutate' });

    if (kind === 'Users') return writeUser(client, connection, { method, id, body });

    return writeGroup(client, connection, { method, id, body, actor });
  });
}

async function rowsFor(client, connection, kind) {
  if (kind === 'Users')
    return client.query(
      'SELECT f.*,r.data FROM fleet_federated f JOIN fleet_resources r ON r.org=f.org AND r.id=f.account WHERE f.org=$1 AND f.connection=$2 AND f.provisioned AND NOT f.deleted ORDER BY f.account LIMIT 10001',
      [connection.org, connection.id],
    );

  return client.query('SELECT * FROM fleet_scim_groups WHERE org=$1 AND connection=$2 ORDER BY id LIMIT 10001', [
    connection.org,
    connection.id,
  ]);
}

async function listOrRead(client, connection, { kind, id, query }) {
  const result = await rowsFor(client, connection, kind);

  insist(result.rowCount <= 10000, 413);

  let items = result.rows.map(kind === 'Users' ? userView : groupView);

  if (id) {
    const item = items.find((entry) => entry.id === id);

    insist(item, 404);

    return { status: 200, body: item };
  }

  const filter = query.get('filter');

  if (filter) {
    const match = /^(externalId|userName|displayName) eq "([^"\\]{1,1024})"$/.exec(filter);

    insist(match);
    items = items.filter((item) => item[match[1]] === match[2]);
  }

  const start = Number(query.get('startIndex') ?? 1);
  const count = Number(query.get('count') ?? 100);

  insist(Number.isSafeInteger(start) && start >= 1 && Number.isSafeInteger(count) && count >= 0 && count <= 100);

  return {
    status: 200,
    body: {
      schemas: [`${MESSAGE}ListResponse`],
      totalResults: items.length,
      startIndex: start,
      itemsPerPage: Math.min(count, Math.max(0, items.length - start + 1)),
      Resources: items.slice(start - 1, start - 1 + count),
    },
  };
}

function patch(current, body, allowed) {
  insist(Array.isArray(body.Operations) && body.Operations.length <= 32 && body.schemas?.includes(`${MESSAGE}PatchOp`));

  const next = { ...current };

  for (const operation of body.Operations) {
    insist(operation.op.toLowerCase() === 'replace');

    const values = operation.path ? { [operation.path]: operation.value } : operation.value;

    insist(values && Object.keys(values).every((key) => allowed.includes(key)));
    Object.assign(next, values);
  }

  return next;
}

async function userRow(client, connection, id) {
  const result = await client.query(
    'SELECT f.*,r.data FROM fleet_federated f JOIN fleet_resources r ON r.org=f.org AND r.id=f.account WHERE f.org=$1 AND f.connection=$2 AND f.account=$3 AND f.provisioned AND NOT f.deleted',
    [connection.org, connection.id, id],
  );

  insist(result.rows[0], 404);

  return result.rows[0];
}

async function writeUser(client, connection, { method, id, body }) {
  if (method === 'DELETE' && id) {
    await userRow(client, connection, id);
    await deactivate(client, connection.org, id);
    await client.query('UPDATE fleet_federated SET deleted=true WHERE org=$1 AND account=$2', [connection.org, id]);
    await client.query(
      'UPDATE fleet_scim_groups SET members=array_remove(members,$3) WHERE org=$1 AND connection=$2 AND $3=ANY(members)',
      [connection.org, connection.id, id],
    );

    return { status: 204 };
  }

  insist(['POST', 'PUT', 'PATCH'].includes(method) && (method === 'POST' ? !id : id), 405);

  const old = id ? await userRow(client, connection, id) : null;
  const data = method === 'PATCH' ? patch(userView(old), body, ['active', 'userName']) : body;

  validateUser(data, old);

  if (!old) await provisionLimit(client, connection, 'Users');

  const account = old ?? (await federatedAccount(client, connection, data.externalId, true));

  insist(method !== 'POST' || account.created || !account.provisioned || account.deleted, 409);
  await client.query(
    "UPDATE fleet_federated SET active=$4,provisioned=true,deleted=false,groups='[]' WHERE org=$1 AND connection=$2 AND account=$3",
    [connection.org, connection.id, account.account, data.active],
  );
  await client.query(
    "UPDATE fleet_resources SET data=jsonb_set(data,'{name}',to_jsonb($3::text)) WHERE org=$1 AND id=$2",
    [connection.org, account.account, data.userName],
  );

  if (!data.active) await deactivate(client, connection.org, account.account);

  return { status: method === 'POST' ? 201 : 200, body: userView(await userRow(client, connection, account.account)) };
}

async function deactivate(client, org, account) {
  await client.query('UPDATE fleet_federated SET active=false WHERE org=$1 AND account=$2', [org, account]);
  await client.query('DELETE FROM fleet_credentials WHERE org=$1 AND account=$2', [org, account]);
}

async function writeGroup(client, connection, { method, id, body, actor }) {
  const found = id
    ? await client.query('SELECT * FROM fleet_scim_groups WHERE org=$1 AND connection=$2 AND id=$3', [
        connection.org,
        connection.id,
        id,
      ])
    : null;
  const old = found?.rows[0];

  insist(!id || old, 404);

  if (method === 'DELETE' && id) {
    await client.query('DELETE FROM fleet_scim_groups WHERE org=$1 AND connection=$2 AND id=$3', [
      connection.org,
      connection.id,
      id,
    ]);

    return { status: 204 };
  }

  insist(['POST', 'PUT', 'PATCH'].includes(method) && (method === 'POST' ? !id : id), 405);

  const data = method === 'PATCH' ? patch(groupView(old), body, ['displayName', 'members']) : body;
  const members = ids(data.members?.map((item) => item.value));

  text(data.displayName);
  text(data.externalId);
  insist(!old || old.external_id === data.externalId);
  insist(!data.roles);
  await protectRecovery(client, actor, { data: { members }, action: 'recovery.scim.members' });

  const accounts = await client.query(
    'SELECT account FROM fleet_federated WHERE org=$1 AND connection=$2 AND provisioned AND account=ANY($3::uuid[])',
    [connection.org, connection.id, members],
  );

  insist(accounts.rowCount === members.length);

  if (!id) await provisionLimit(client, connection, 'Groups');

  const key = id ?? randomUUID();

  await client.query(
    'INSERT INTO fleet_scim_groups(org,connection,id,external_id,name,members) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org,connection,id) DO UPDATE SET name=EXCLUDED.name,members=EXCLUDED.members',
    [connection.org, connection.id, key, data.externalId, data.displayName, members],
  );

  return {
    status: method === 'POST' ? 201 : 200,
    body: {
      schemas: [`${CORE}Group`],
      id: key,
      externalId: data.externalId,
      displayName: data.displayName,
      members: members.map((value) => ({ value })),
    },
  };
}

async function provisionLimit(client, connection, kind) {
  const found = await rowsFor(client, connection, kind);

  insist(found.rowCount < 10000, 413);
}

function validateUser(data, old) {
  insist(typeof data.active === 'boolean');
  text(data.userName);
  text(data.externalId, 1024);
  insist(!old || old.subject === data.externalId);
  insist(!data.roles && !data.groups && !data.password);
}
