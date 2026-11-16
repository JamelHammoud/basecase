import { authenticate } from './identity.mjs';
import { listResources } from './registry.mjs';
import { insist } from './validation.mjs';

function send(response, event, data) {
  if (response.destroyed || response.writableEnded) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  if (response.writableLength > 262144 || Buffer.byteLength(message) > 262144) {
    response.end();

    return;
  }

  response.write(message);
}

export async function subscriptions(pool) {
  const listener = await pool.connect();
  const streams = new Set();

  await listener.query('LISTEN fleet_changes');
  listener.on('notification', ({ payload }) => {
    const change = JSON.parse(payload);

    for (const stream of streams) {
      if (stream.org === change.org && (!change.credential || stream.credential === change.credential))
        void stream.refresh(change.kind);
    }
  });
  listener.on('error', () => {
    for (const stream of streams) stream.response.end();
  });

  return {
    async open({ request, response, token, actor }) {
      insist(streams.size < 64, 503);
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });

      let busy = false;
      let pending = false;
      const stream = {
        org: actor.org,
        credential: actor.credential,
        response,
        async refresh(kind) {
          if (!['fleet_status', 'fleet_facilities'].includes(kind)) {
            send(response, 'reset', {});
            response.end();

            return;
          }

          pending = true;

          if (busy) return;

          busy = true;

          try {
            while (pending && !response.writableEnded && !response.destroyed) {
              pending = false;

              const current = await authenticate(pool, token);
              const page = await listResources(pool, current, { kind: 'robot' });

              send(response, 'snapshot', page);
            }
          } catch {
            send(response, 'reset', {});
            response.end();
          } finally {
            busy = false;
          }
        },
      };

      streams.add(stream);
      response.on('close', () => streams.delete(stream));
      request.on('error', () => response.end());
      send(response, 'snapshot', await listResources(pool, actor, { kind: 'robot' }));
    },
    async close() {
      for (const stream of streams) stream.response.end();

      await listener.query('UNLISTEN fleet_changes');
      listener.release();
    },
  };
}
