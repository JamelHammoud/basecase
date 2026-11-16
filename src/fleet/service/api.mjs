import { enroll, invite, login, serviceCredential } from './identity.mjs';
import { generation, ingest } from './ingest.mjs';
import {
  createResource,
  deleteResource,
  demand,
  listResources,
  organization,
  readResource,
  readVisible,
  updateResource,
} from './registry.mjs';
import { administrative, identifier, insist, KINDS } from './validation.mjs';
import { ACTIONS } from './authorization.mjs';

export async function publicApi(pool, method, path, body) {
  if (method === 'POST' && path === '/v1/sessions') return login(pool, body);

  if (method === 'POST' && path === '/v1/enroll') return enroll(pool, body);

  return null;
}

async function identityApi(client, actor, options) {
  const { method, parts, body, query } = options;
  const [kind, id] = parts;

  demand(actor, 'iam.manage', organization(actor.org));

  if (kind === 'invitations' && method === 'POST') return invite(client, actor, body);

  if (kind === 'credentials' && method === 'POST') return serviceCredential(client, actor, body);

  if (kind === 'credentials' && method === 'DELETE') {
    await client.query('DELETE FROM fleet_credentials WHERE org=$1 AND id=$2', [actor.org, identifier(id)]);

    return { revoked: true };
  }

  if (kind === 'credentials' && method === 'GET') {
    const result = await client.query(
      'SELECT id,account,kind,expires FROM fleet_credentials WHERE org=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 100',
      [actor.org, query.get('after') || null],
    );

    return { items: result.rows, next: result.rowCount === 100 ? result.rows.at(-1).id : null };
  }

  insist(false, 404);
}

export async function authenticatedApi(client, actor, options) {
  const { method, parts, body, query } = options;
  const [kind, id] = parts;

  if (['invitations', 'credentials'].includes(kind)) return identityApi(client, actor, options);

  if (kind === 'generations' && method === 'POST') return generation(client, actor, id);

  if (kind === 'status' && method === 'POST') return ingest(client, actor, body);

  if (kind === 'export' && method === 'GET') {
    insist(
      actor.rules.some((rule) => rule.effect === 'allow' && rule.actions.includes('inventory.export')),
      403,
    );

    return listResources(client, actor, {
      kind: 'robot',
      action: 'inventory.export',
      after: query.get('after') || null,
    });
  }

  if (kind === 'contracts' && method === 'GET')
    return { version: 1, actions: ACTIONS, pageSize: 100, updateBatch: 100, subscriptionPage: 100 };

  return resourceApi(client, actor, options);
}

async function resourceApi(client, actor, options) {
  const { method, parts, body, query } = options;
  const [kind, id, subpath] = parts;

  insist(KINDS.includes(kind) && parts.length <= 3, 404);

  if (subpath === 'content') return assetContent(client, actor, { method, kind, id });

  if (method === 'GET' && !id)
    return listResources(client, actor, {
      kind,
      action: administrative(kind) ? 'iam.manage' : 'inventory.view',
      site: query.get('site') || null,
      after: query.get('after') || null,
    });

  if (method === 'GET') return readVisible(client, actor, kind, id);

  if (method === 'POST' && !id) return createResource(client, actor, kind, body);

  if (method === 'PUT' && id) return updateResource(client, actor, { kind, id, body });

  if (method === 'DELETE' && id) return deleteResource(client, actor, kind, id);

  insist(false, 404);
}

async function assetContent(client, actor, { method, kind, id }) {
  insist(kind === 'asset' && method === 'GET', 404);

  const item = await readResource(client, actor.org, id);

  demand(actor, 'inventory.view', item);
  insist(item.kind === 'asset');

  return { content: item.content, mediaType: item.mediaType };
}
