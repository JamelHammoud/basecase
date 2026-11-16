import { randomUUID } from 'node:crypto';
import { allowed } from './authorization.mjs';
import { administrative, identifier, insist, resourceData } from './validation.mjs';

export const organization = (org) => ({
  id: org,
  org,
  kind: 'organization',
  ancestors: [],
  attributes: {},
  siteAttributes: {},
});
export const demand = (actor, action, resource) => insist(allowed(actor, action, resource), 403);

function demandResource(actor, action, resource) {
  if (administrative(resource.kind)) demand(actor, 'iam.manage', organization(actor.org));

  demand(actor, action, resource);
}

const selection = `SELECT r.*,s.status,s.observed_at,s.received_at,s.generation,s.pose,s.work,CASE WHEN facility.site IS NULL THEN NULL ELSE jsonb_build_object('hash',facility.summary->'hash','name',facility.summary->'name','revision',facility.summary->'revision') END AS facility,facility.registration,facility.site AS facility_site,
 COALESCE((SELECT jsonb_object_agg(a.key,a.value ORDER BY array_position(r.ancestors,p.id)) FROM fleet_resources p CROSS JOIN LATERAL jsonb_each(COALESCE(p.data->'attributes','{}')) a WHERE p.org=r.org AND p.kind='site' AND p.id=ANY(r.ancestors)),'{}') AS site_attributes,
 (SELECT p.data->'attributes' FROM fleet_resources p WHERE p.org=r.org AND p.kind='robot' AND p.id=ANY(r.ancestors) LIMIT 1) AS robot_attributes
 FROM fleet_resources r LEFT JOIN fleet_status s ON s.org=r.org AND s.robot=r.id
 LEFT JOIN fleet_facilities facility ON facility.org=r.org AND facility.site=r.id`;

function presented(row) {
  const siteAttributes = { ...row.site_attributes, ...(row.kind === 'site' ? row.data.attributes : {}) };
  const observedAt = row.observed_at?.toISOString() ?? null;

  return {
    ...row.data,
    id: row.id,
    org: row.org,
    kind: row.kind,
    parent: row.parent,
    ancestors: row.ancestors,
    attributes: row.data.attributes ?? {},
    siteAttributes,
    robotAttributes: row.robot_attributes,
    pose: row.pose ?? null,
    work: row.work ?? null,
    facility: row.facility ?? null,
    registration: row.registration ?? null,
    facilitySite: row.facility_site ?? null,
    status: row.status ?? 'unknown',
    observedAt,
    receivedAt: row.received_at?.toISOString() ?? null,
    generation: Number(row.generation ?? 0),
    stale: !observedAt || Date.now() - Date.parse(observedAt) > 60000,
  };
}

export async function readResource(client, org, id) {
  const result = await client.query(`${selection} WHERE r.org=$1 AND r.id=$2`, [org, identifier(id)]);

  insist(result.rows[0], 403);

  return presented(result.rows[0]);
}

export async function readResources(client, org, ids) {
  const result = await client.query(`${selection} WHERE r.org=$1 AND r.id=ANY($2::uuid[])`, [org, ids]);

  return result.rows.map(presented);
}

function visible(item, actor) {
  const publicFields = { ...item, canManage: Boolean(actor && allowed(actor, 'inventory.manage', item)) };

  delete publicFields.content;
  delete publicFields.ancestors;
  delete publicFields.siteAttributes;
  delete publicFields.robotAttributes;

  return publicFields;
}

export async function readVisible(client, actor, kind, id) {
  const item = await readResource(client, actor.org, id);

  insist(item.kind === kind, 403);
  demandResource(actor, administrative(kind) ? 'iam.manage' : 'inventory.view', item);

  return visible(item, actor);
}

export async function listResources(client, actor, options) {
  const { kind, action = 'inventory.view', limit = 100, after = null, site = null } = options;

  if (site) demand(actor, action, await readResource(client, actor.org, site));

  if (administrative(kind)) demand(actor, 'iam.manage', organization(actor.org));

  const scopes = [
    ...new Set(
      actor.rules.filter((rule) => rule.effect === 'allow' && rule.actions.includes(action)).map((rule) => rule.scope),
    ),
  ];
  const all = scopes.includes('*');
  const scopeIds = scopes.filter((scope) => scope !== '*');
  const items = [];
  let cursor = after;
  let exhausted = false;

  while (items.length < limit && !exhausted) {
    const result = await client.query(
      `${selection} WHERE r.org=$1 AND r.kind=$2 AND ($3::uuid IS NULL OR r.id>$3) AND ($4 OR r.id=ANY($5::uuid[]) OR r.ancestors && $5::uuid[]) AND ($6::uuid IS NULL OR r.id=$6 OR $6=ANY(r.ancestors)) ORDER BY r.id LIMIT 256`,
      [actor.org, kind, cursor, all, scopeIds, site],
    );

    exhausted = result.rowCount < 256;

    for (const row of result.rows) {
      cursor = row.id;

      addVisible(items, actor, action, row);

      if (items.length === limit) break;
    }
  }

  return { items, next: exhausted && items.length < limit ? null : cursor };
}

function addVisible(items, actor, action, row) {
  const item = presented(row);

  if (allowed(actor, action, item)) items.push(visible(item, actor));
}

async function checkReferences(client, actor, kind, data) {
  const references = [
    ...(data.roles ?? []),
    ...(data.members ?? []),
    ...(kind === 'role' ? data.rules.filter((rule) => rule.scope !== '*').map((rule) => rule.scope) : []),
  ];

  for (const id of references) {
    if (kind === 'role' && id === actor.org) continue;

    const item = await readResource(client, actor.org, id);

    insist(!data.roles?.includes(id) || item.kind === 'role');
    insist(!data.members?.includes(id) || item.kind === 'account');
  }
}

export async function createResource(client, actor, kind, body) {
  const id = randomUUID();
  const parent = body.parent ? await readResource(client, actor.org, body.parent) : organization(actor.org);
  const action = administrative(kind) ? 'iam.manage' : 'inventory.manage';

  insist(parent.ancestors.length < 16);
  insist(!administrative(kind) || !body.parent);
  insist(kind !== 'robot' || parent.kind === 'site');
  insist(kind !== 'site' || ['organization', 'region', 'site'].includes(parent.kind));
  insist(kind !== 'region' || parent.kind === 'organization');
  insist(kind !== 'asset' || parent.kind === 'robot' || parent.kind === 'site');

  const data = resourceData(kind, body);
  const ancestors = [...parent.ancestors, parent.id];
  const proposed = proposedResource({ org: actor.org, id, kind, ancestors }, data, parent);

  demandResource(actor, action, proposed);
  await checkReferences(client, actor, kind, data);
  await client.query('INSERT INTO fleet_resources(org,id,kind,parent,ancestors,data) VALUES ($1,$2,$3,$4,$5,$6)', [
    actor.org,
    id,
    kind,
    parent.kind === 'organization' ? null : parent.id,
    ancestors,
    data,
  ]);

  return visible(await readResource(client, actor.org, id), actor);
}

export async function updateResource(client, actor, options) {
  const { kind, id, body } = options;
  const current = await readResource(client, actor.org, id);

  insist(current.kind === kind && (body.parent === undefined || body.parent === current.parent));
  demandResource(actor, administrative(kind) ? 'iam.manage' : 'inventory.manage', current);

  const data = resourceData(kind, body);
  const parent = current.parent ? await readResource(client, actor.org, current.parent) : organization(actor.org);

  demandResource(
    actor,
    administrative(kind) ? 'iam.manage' : 'inventory.manage',
    proposedResource(current, data, parent),
  );
  await checkReferences(client, actor, kind, data);
  await client.query('UPDATE fleet_resources SET data=$3 WHERE org=$1 AND id=$2', [actor.org, id, data]);

  return visible(await readResource(client, actor.org, id), actor);
}

export async function deleteResource(client, actor, kind, id) {
  const current = await readResource(client, actor.org, id);

  insist(current.kind === kind, 403);
  demandResource(actor, administrative(kind) ? 'iam.manage' : 'inventory.manage', current);
  await client.query('DELETE FROM fleet_resources WHERE org=$1 AND id=$2', [actor.org, id]);

  return { deleted: true };
}

function proposedResource(current, data, parent) {
  return {
    ...current,
    attributes: data.attributes,
    siteAttributes: { ...parent.siteAttributes, ...(current.kind === 'site' ? data.attributes : {}) },
    robotAttributes: parent.kind === 'robot' ? parent.attributes : parent.robotAttributes,
  };
}
