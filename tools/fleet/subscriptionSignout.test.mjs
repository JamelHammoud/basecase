import { afterAll, beforeAll, expect, it } from 'vitest';
import { startService } from '../../src/fleet/service/http.mjs';
import { fleetFixture } from './fixture.mjs';
import { freePort } from './postgres.mjs';

let fixture;

beforeAll(async () => {
  fixture = await fleetFixture();
});
afterAll(async () => fixture?.close());

async function handshakeFixture() {
  const opening = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const signingOut = Promise.withResolvers();
  let listener = true;
  let handshaking = false;
  const pool = {
    async query(...args) {
      const result = await fixture.pool.query(...args);

      if (args[0].startsWith('DELETE FROM fleet_credentials')) signingOut.resolve();

      return result;
    },
    async connect() {
      const client = await fixture.pool.connect();
      const notificationClient = listener;

      listener = false;

      return {
        on: client.on.bind(client),
        release: client.release.bind(client),
        async query(...args) {
          if (notificationClient && args[0] === 'SELECT 1') {
            handshaking = true;
            opening.resolve();
            await resume.promise;
          }

          if (!notificationClient && handshaking && args[0].includes('FOR UPDATE')) signingOut.resolve();

          return client.query(...args);
        },
      };
    },
  };
  const origin = `http://127.0.0.1:${await freePort()}`;
  const service = await startService({ pool, origin });

  return { origin, service, opening, resume, signingOut };
}

it.each([false, true])(
  'retains revocation when signing out during a subscription handshake, access=%s',
  async (access) => {
    const user = await fixture.bootstrap(`Handshake ${access}`);
    const app = await handshakeFixture();
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${user.token}` };
    const subscription = fetch(`${app.origin}/v1/${user.org}/subscribe?access=${Number(access)}`, {
      headers,
      signal: controller.signal,
    });
    let signout;

    try {
      await app.opening.promise;
      signout = fetch(`${app.origin}/v1/sessions/current`, { method: 'DELETE', headers });
      await app.signingOut.promise;

      const credential = await fixture.pool.query('SELECT id FROM fleet_credentials WHERE id=$1', [user.credential]);

      expect(credential.rowCount).toBe(1);
      app.resume.resolve();

      const response = await subscription;

      expect(response.status).toBe(200);
      expect((await signout).status).toBe(200);

      const body = await response.text();

      expect(body).toBe(
        `event: snapshot\ndata: ${JSON.stringify(access ? {} : { items: [], next: null })}\n\nevent: reset\ndata: {}\n\n`,
      );
      expect((await fetch(`${app.origin}/v1/me`, { headers })).status).toBe(401);
    } finally {
      app.resume.resolve();
      controller.abort();
      await Promise.allSettled([subscription, signout]);
      await app.service.close();
    }
  },
);
