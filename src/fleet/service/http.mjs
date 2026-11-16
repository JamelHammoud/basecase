import http from 'node:http';
import https from 'node:https';
import { authenticate } from './identity.mjs';
import { authenticatedApi, publicApi } from './api.mjs';
import { transaction } from './database.mjs';
import { identifier, insist } from './validation.mjs';
import { subscriptions } from './subscriptions.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);
const sessionCookie = (token, secure) =>
  `fleet_session=${token}; HttpOnly; SameSite=Strict; Path=/v1; Max-Age=43200${secure ? '; Secure' : ''}`;
const tokenOf = (request) =>
  request.headers.authorization?.replace(/^Bearer /, '') ??
  /(?:^|;\s*)fleet_session=([A-Za-z0-9_-]+)/.exec(request.headers.cookie ?? '')?.[1];

async function readBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    insist(size <= 131072, 413);
    chunks.push(chunk);
  }

  if (!size) return {};

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function reply(response, data, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

function guard(request, origin) {
  insist(request.headers.host === origin.host, 403);
  insist(!request.headers.origin || request.headers.origin === origin.origin, 403);
  insist(
    !request.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']),
    403,
  );
}

async function dispatch(options) {
  const { request, response, pool, stream, origin } = options;
  const url = new URL(request.url, origin);
  const method = request.method;

  insist(request.headers.host === origin.host, 403);
  insist(
    origin.protocol === 'https:' ||
      ['127.0.0.1', '::1'].includes(request.socket.remoteAddress?.replace(/^::ffff:/, '')),
    403,
  );

  if (!url.pathname.startsWith('/v1/')) return options.assets(request, response, url);

  guard(request, origin);

  const body = await readBody(request);
  const publicResult = await publicApi(pool, method, url.pathname, body);

  if (publicResult) {
    response.setHeader('Set-Cookie', sessionCookie(publicResult.token, origin.protocol === 'https:'));
    reply(response, publicResult);

    return;
  }

  const token = tokenOf(request);
  const actor = await authenticate(pool, token);

  if (url.pathname === '/v1/me' && method === 'GET')
    return reply(response, { org: actor.org, account: actor.account, credential: actor.credential });

  if (url.pathname === '/v1/sessions/current' && method === 'DELETE') {
    await pool.query('DELETE FROM fleet_credentials WHERE id=$1', [actor.credential]);
    response.setHeader('Set-Cookie', sessionCookie('', origin.protocol === 'https:'));
    reply(response, { revoked: true });

    return;
  }

  const [, , org, ...parts] = url.pathname.split('/');

  insist(identifier(org) === actor.org, 403);

  if (parts[0] === 'subscribe' && method === 'GET') return stream.open({ request, response, token, actor });

  const result = await transaction(pool, (client) =>
    authenticatedApi(client, actor, { method, parts, body, query: url.searchParams }),
  );

  reply(response, result);
}

export async function startService(options) {
  const origin = new URL(options.origin);

  insist(origin.protocol === 'https:' || (origin.protocol === 'http:' && LOOPBACK.has(origin.hostname)));
  insist(origin.protocol !== 'https:' || options.tls);
  insist(origin.pathname === '/' && !origin.username && !origin.password);
  insist(origin.protocol === 'https:' || LOOPBACK.has(options.host ?? origin.hostname));

  const pool = options.pool;
  const stream = await subscriptions(pool);
  const handle = (request, response) => {
    void dispatch({
      request,
      response,
      pool,
      stream,
      origin,
      assets: options.assets ?? ((_request, res) => reply(res, {}, 404)),
    }).catch((error) => {
      if (response.headersSent) return response.end();

      reply(response, { error: 'Fleet request refused' }, error.status ?? 400);
    });
  };
  const server = options.tls ? https.createServer(options.tls, handle) : http.createServer(handle);

  server.maxConnections = 128;
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(
      options.port ?? Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)),
      options.host ?? origin.hostname.replace(/^\[|\]$/g, ''),
      resolve,
    );
  });

  return {
    server,
    async close() {
      await stream.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
