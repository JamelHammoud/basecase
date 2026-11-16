import { database } from '../../src/fleet/service/database.mjs';
import { bootstrap } from '../../src/fleet/service/identity.mjs';
import { startService } from '../../src/fleet/service/http.mjs';
import { freePort, postgresFixture } from './postgres.mjs';

const PASSWORD = 'fleet-fixture-password';

export function fleetClient(fixture, identity) {
  const client = {
    ...identity,
    async call(method, suffix, body, org = identity.org) {
      return fetch(`${fixture.origin}/v1/${org}/${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' },
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
      });
    },
    async result(method, suffix, body) {
      const response = await client.call(method, suffix, body);
      const result = await response.json();

      if (!response.ok) throw new Error(`${method} ${suffix}: ${response.status}`);

      return result;
    },
    create: (kind, body) => client.result('POST', kind, body),
    update: (kind, id, body) => client.result('PUT', `${kind}/${id}`, body),
    remove: (kind, id) => client.result('DELETE', `${kind}/${id}`),
    list: (kind, after) => client.result('GET', `${kind}${after ? `?after=${after}` : ''}`),
    generation: async (id) => (await client.result('POST', `generations/${id}`, {})).generation,
    publish: (updates) => client.result('POST', 'status', updates),
    async service(rules) {
      const credential = await client.result('POST', 'credentials', { rules });

      return fleetClient(fixture, { ...identity, token: credential.token, credential: credential.id });
    },
    async enroll(email, roles) {
      const account = await client.create('account', { name: email, roles });
      const invite = await client.result('POST', 'invitations', { account: account.id, email });
      const response = await fixture.enroll(invite.token, PASSWORD);
      const session = await response.json();

      return fleetClient(fixture, {
        org: identity.org,
        id: account.id,
        token: session.token,
        credential: session.id,
        invite: invite.token,
        email,
      });
    },
    async subscribe() {
      const controller = new AbortController();
      const response = await fetch(`${fixture.origin}/v1/${identity.org}/subscribe`, {
        headers: { Authorization: `Bearer ${identity.token}` },
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      let buffer = '';

      return {
        async next() {
          while (!buffer.includes('\n\n')) {
            const chunk = await reader.read();

            if (chunk.done) throw new Error('Subscription ended');

            buffer += new TextDecoder().decode(chunk.value);
          }

          const end = buffer.indexOf('\n\n');
          const event = buffer.slice(0, end);

          buffer = buffer.slice(end + 2);

          return { event: /^event: (.+)$/m.exec(event)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(event)[1]) };
        },
        close: async () => controller.abort(),
      };
    },
  };

  return client;
}

export async function fleetFixture(options = {}) {
  const postgres = await postgresFixture();
  const port = await freePort();
  let pool = await database(postgres.url);
  let service;
  const fixture = {
    origin: `http://127.0.0.1:${port}`,
    databaseUrl: postgres.url,
    get pool() {
      return pool;
    },
    async bootstrap(name) {
      const email = `${name.toLowerCase()}@example.test`;
      const identity = await bootstrap(pool, { name, email, password: PASSWORD });
      const response = await fetch(`${fixture.origin}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: identity.org, email, password: PASSWORD }),
      });
      const session = await response.json();

      return fleetClient(fixture, {
        org: identity.org,
        id: identity.account,
        token: session.token,
        credential: session.id,
        email,
      });
    },
    enroll: (token, password) =>
      fetch(`${fixture.origin}/v1/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      }),
    anonymous: (suffix) => fetch(`${fixture.origin}/v1${suffix}`),
    async restart() {
      await service.close();
      await pool.end();
      pool = await database(postgres.url);
      service = await startService({ pool, origin: fixture.origin, assets: options.assets });
    },
    async close() {
      await service.close();
      await pool.end();
      await postgres.close();
    },
  };

  service = await startService({ pool, origin: fixture.origin, assets: options.assets });

  return fixture;
}
