import { startSso, finishSso } from './saml.mjs';
import { scimRequest } from './scim.mjs';
import { identifier, insist } from './validation.mjs';

export async function federationHttp(options) {
  const { url, request, response, pool, origin, readBody, reply, sessionCookie } = options;
  const scim = /^\/scim\/v2\/([^/]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);

  if (scim) return serveScim(options, scim);

  const route = /^\/v1\/([^/]+)\/sso(?:\/([^/]+)\/(start|acs))?$/.exec(url.pathname);

  if (!route) return false;

  const [, org, id, action] = route;

  identifier(org);

  if (action !== 'acs') options.guard(request, origin);

  if (!action && request.method === 'GET') {
    const result = await pool.query(
      "SELECT id,data->>'name' AS name FROM fleet_connections WHERE org=$1 AND (data->>'enabled')::boolean ORDER BY id LIMIT 32",
      [org],
    );

    reply(response, { items: result.rows });

    return true;
  }

  identifier(id);

  if (action === 'start' && request.method === 'GET') {
    const result = await startSso(pool, { org, id, origin: origin.origin });
    const secure = origin.protocol === 'https:';

    response.writeHead(303, {
      Location: result.location,
      'Cache-Control': 'no-store',
      'Set-Cookie': `fleet_sso=${result.browser}; HttpOnly; Path=/v1/${org}/sso/${id}/acs; Max-Age=300; SameSite=${secure ? 'None; Secure' : 'Lax'}`,
    });
    response.end();

    return true;
  }

  insist(action === 'acs' && request.method === 'POST', 405);
  insist(request.headers['content-type']?.split(';')[0] === 'application/x-www-form-urlencoded');

  const encoded = await readBody(request, true);
  const params = new URLSearchParams(encoded);

  insist(params.getAll('SAMLResponse').length === 1 && params.getAll('RelayState').length === 1);

  const browser = /(?:^|;\s*)fleet_sso=([A-Za-z0-9_-]+)/.exec(request.headers.cookie ?? '')?.[1];
  const session = await finishSso(pool, { org, id, origin: origin.origin, browser, body: Object.fromEntries(params) });

  response.writeHead(303, {
    Location: '/fleet',
    'Cache-Control': 'no-store',
    'Set-Cookie': sessionCookie(session.token, origin.protocol === 'https:'),
  });
  response.end();

  return true;
}

async function serveScim(options, scim) {
  const { request, response, pool, origin, readBody, reply, url } = options;

  options.guard(request, origin);

  const [, org, connection, kind, id] = scim;

  try {
    const result = await scimRequest(pool, {
      org,
      connection,
      kind,
      id,
      method: request.method,
      query: url.searchParams,
      body: await readBody(request),
      token: request.headers.authorization?.replace(/^Bearer /, ''),
    });

    response.writeHead(result.status, {
      'Content-Type': 'application/scim+json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(result.body ? JSON.stringify(result.body) : undefined);
  } catch (error) {
    reply(
      response,
      {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: String(error.status ?? 400),
        detail: 'Fleet request refused',
      },
      error.status ?? 400,
    );
  }

  return true;
}
