import { randomUUID } from 'node:crypto';
import { insist, text } from './validation.mjs';

export async function federatedAccount(client, connection, subject, provisioned = false) {
  text(subject, 1024);

  const { org, id } = connection;
  const found = await client.query('SELECT * FROM fleet_federated WHERE org=$1 AND connection=$2 AND subject=$3', [
    org,
    id,
    subject,
  ]);

  if (found.rows[0]) return found.rows[0];

  const account = randomUUID();

  await client.query("INSERT INTO fleet_resources(org,id,kind,ancestors,data) VALUES ($1,$2,'account',$3,$4)", [
    org,
    account,
    [org],
    { name: subject.slice(0, 200), roles: [] },
  ]);
  await client.query(
    'INSERT INTO fleet_federated(org,connection,subject,account,provisioned) VALUES ($1,$2,$3,$4,$5)',
    [org, id, subject, account, provisioned],
  );

  return { org, connection: id, subject, account, active: true, provisioned, created: true };
}

export async function federationRoles(client, credential) {
  const result = await client.query(
    'SELECT f.*,c.data FROM fleet_federated f JOIN fleet_connections c ON c.org=f.org AND c.id=f.connection WHERE f.org=$1 AND f.account=$2',
    [credential.org, credential.account],
  );
  const identity = result.rows[0];

  if (!identity) return [];

  insist(identity.active && identity.data.enabled && credential.connection === identity.connection, 401);

  const memberships = await client.query(
    'SELECT external_id FROM fleet_scim_groups WHERE org=$1 AND connection=$2 AND $3=ANY(members)',
    [identity.org, identity.connection, identity.account],
  );
  const groups = identity.provisioned ? memberships.rows.map((row) => row.external_id) : identity.groups;

  return [
    ...new Set(
      identity.data.mappings.filter((mapping) => groups.includes(mapping.group)).flatMap((mapping) => mapping.roles),
    ),
  ];
}

export async function localLoginAllowed(client, org, account) {
  const result = await client.query(
    'SELECT 1 FROM fleet_federation_policy p WHERE p.org=$1 AND p.enforced AND NOT EXISTS (SELECT 1 FROM fleet_recovery r WHERE r.org=p.org AND r.id=$2)',
    [org, account],
  );
  const federated = await client.query('SELECT 1 FROM fleet_federated WHERE org=$1 AND account=$2', [org, account]);

  insist(result.rowCount === 0 && federated.rowCount === 0, 401);
}
