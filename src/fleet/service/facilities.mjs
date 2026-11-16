import { Worker } from 'node:worker_threads';
import { authenticate } from './identity.mjs';
import { demand, readResource } from './registry.mjs';
import { insist, identifier } from './validation.mjs';

const MAX_BYTES = 64 * 1024 * 1024;

async function readBytes(request) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    insist(bytes <= MAX_BYTES, 413);
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export function facilityJobs() {
  const active = new Set();

  return {
    async prepare(request, mode) {
      insist(active.size < 2, 503);

      const reservation = {};

      active.add(reservation);

      try {
        const bytes = await readBytes(request);

        return await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./facilityWorker.mjs', import.meta.url), {
            workerData: { bytes, mode },
            resourceLimits: { maxOldGenerationSizeMb: 512 },
          });
          const timer = mode === 'convert' ? null : setTimeout(() => void worker.terminate(), 15000);

          worker.once('message', (message) => {
            if (message.error) reject(new Error(message.error));
            else resolve(message.result);
          });
          worker.once('error', reject);
          worker.once('exit', () => {
            if (timer) clearTimeout(timer);

            reject(new Error('Fleet facility request refused'));
          });
        });
      } finally {
        active.delete(reservation);
      }
    },
  };
}

export async function facilityRequest(options) {
  const { pool, actor, parts, method, request, jobs, token } = options;
  const [, id, , subpath] = parts;
  const site = await readResource(pool, actor.org, identifier(id));
  const action = method === 'GET' ? 'inventory.view' : 'inventory.manage';

  insist(site.kind === 'site' && parts.length <= 4, 404);
  demand(actor, action, site);

  if (method === 'GET') {
    const result = await pool.query(
      `SELECT summary,registration${subpath === 'geometry' ? ',geometry' : ''} FROM fleet_facilities WHERE org=$1 AND site=$2`,
      [actor.org, id],
    );
    const record = result.rows[0];

    return facilityRead(record, subpath);
  }

  insist(method === 'PUT' || (method === 'POST' && subpath === 'convert'), 404);

  insist(!subpath || ['convert', 'registration'].includes(subpath), 404);

  const mode = { convert: 'convert', registration: 'registration' }[subpath] ?? 'import';
  const prepared = await jobs.prepare(request, mode);
  const current = await authenticate(pool, token);

  demand(current, action, await readResource(pool, actor.org, id));

  if (mode === 'convert') return { raw: prepared.encoded };

  if (mode === 'registration') {
    const result = await pool.query(
      "UPDATE fleet_facilities SET registration=$3 WHERE org=$1 AND site=$2 AND summary->>'hash'=$4",
      [actor.org, id, prepared.registration, prepared.facility],
    );

    insist(result.rowCount, 409);

    return { data: { registration: prepared.registration } };
  }

  await pool.query(
    'INSERT INTO fleet_facilities(org,site,summary,geometry,source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(org,site) DO UPDATE SET summary=EXCLUDED.summary,geometry=EXCLUDED.geometry,source=EXCLUDED.source,registration=NULL',
    [actor.org, id, prepared.summary, prepared.content, prepared.source],
  );

  return { data: { facility: prepared.summary, registration: null } };
}

function facilityRead(record, subpath) {
  if (subpath === 'geometry') {
    return {
      raw: `{"facility":${JSON.stringify(record?.summary ?? null)},"registration":${JSON.stringify(record?.registration ?? null)},"geometry":${record?.geometry ?? 'null'}}`,
    };
  }

  insist(!subpath, 404);

  return { data: { facility: record?.summary ?? null, registration: record?.registration ?? null } };
}
