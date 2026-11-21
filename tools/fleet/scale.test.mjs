import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { fleetFixture } from './fixture.mjs';
import { DEPLOYMENTS } from './deployments.mjs';

let fixture;
let client;
let robots;
let subscription;
let reading;
let stop = false;
const metrics = {
  robots: 10000,
  sites: 100,
  ingestMs: 0,
  ingestBytes: 0,
  queryMs: [],
  queryBytes: 0,
  subscriptionBytes: 0,
  snapshots: 0,
};

async function readSnapshots() {
  while (!stop) {
    try {
      const next = await subscription.next();
      const items = next.data.items;

      expect(items.length).toBeLessThanOrEqual(100);
      metrics.subscriptionBytes += Buffer.byteLength(JSON.stringify(next.data));
      metrics.snapshots++;
    } catch (error) {
      if (!stop) throw error;
    }
  }
}

async function seedRegistry(admin) {
  const sites = Array.from({ length: 100 }, (_, index) => ({ id: randomUUID(), name: `Site ${index}` }));

  robots = Array.from({ length: 10000 }, (_, index) => ({
    id: randomUUID(),
    site: sites[index % 100].id,
    attributes: DEPLOYMENTS[index % 10],
  }));
  await fixture.pool.query(
    `INSERT INTO fleet_resources(org,id,kind,ancestors,data)
    SELECT $1,id,'site',ARRAY[$1::uuid],jsonb_build_object('name',name,'attributes','{}'::jsonb)
    FROM jsonb_to_recordset($2::jsonb) AS s(id uuid,name text)`,
    [admin.org, JSON.stringify(sites)],
  );
  await fixture.pool.query(
    `INSERT INTO fleet_resources(org,id,kind,parent,ancestors,data)
    SELECT $1,id,'robot',site,ARRAY[$1::uuid,site],jsonb_build_object('name','Acme','attributes',attributes)
    FROM jsonb_to_recordset($2::jsonb) AS r(id uuid,site uuid,attributes jsonb)`,
    [admin.org, JSON.stringify(robots)],
  );
  await fixture.pool.query(
    "INSERT INTO fleet_status(org,robot,generation) SELECT org,id,1 FROM fleet_resources WHERE org=$1 AND kind='robot'",
    [admin.org],
  );
}

beforeAll(async () => {
  fixture = await fleetFixture();

  const admin = await fixture.bootstrap('Scale');

  await seedRegistry(admin);
  client = await admin.service([
    { effect: 'allow', scope: '*', actions: ['status.publish', 'inventory.view'], conditions: {} },
  ]);
  subscription = await client.subscribe();
  metrics.memoryBefore = process.memoryUsage();
  reading = readSnapshots();
});

afterAll(async () => {
  stop = true;
  await subscription?.close();
  await reading;
  metrics.memoryAfter = process.memoryUsage();
  metrics.ingestPerSecond = 10000 / (metrics.ingestMs / 1000);

  const sorted = metrics.queryMs.toSorted((a, b) => a - b);

  metrics.queryP50Ms = sorted[Math.floor(sorted.length * 0.5)];
  metrics.queryP95Ms = sorted[Math.floor(sorted.length * 0.95)];

  const result = await fixture.pool.query(
    "SELECT pg_total_relation_size('fleet_resources')::text AS resources,pg_total_relation_size('fleet_status')::text AS status,pg_total_relation_size('fleet_ingest_events')::text AS events",
  );

  metrics.databaseBytes = result.rows[0];
  console.log(`Fleet scale: ${JSON.stringify(metrics)}`);

  if (process.env.FLEET_MEASUREMENTS_FILE)
    await writeFile(process.env.FLEET_MEASUREMENTS_FILE, JSON.stringify(metrics, null, 2));

  await fixture?.close();
});

it.each(Array.from({ length: 10 }, (_, index) => index))(
  'ingests bounded status batches for registry segment %i',
  async (index) => {
    const slice = robots.slice(index * 1000, (index + 1) * 1000);
    const started = performance.now();

    for (let offset = 0; offset < slice.length; offset += 100) {
      const updates = slice.slice(offset, offset + 100).map((robot) => ({
        robot: robot.id,
        generation: 1,
        event: randomUUID(),
        observedAt: new Date().toISOString(),
        status: 'online',
      }));

      metrics.ingestBytes += Buffer.byteLength(JSON.stringify(updates));
      expect((await client.publish(updates)).accepted).toBe(100);
    }

    metrics.ingestMs += performance.now() - started;
  },
);

it('enumerates the full persisted registry through bounded keyset pages', async () => {
  const seen = new Set();
  let cursor = null;

  do {
    const started = performance.now();
    const page = await client.list('robot', cursor);

    metrics.queryMs.push(performance.now() - started);
    metrics.queryBytes += Buffer.byteLength(JSON.stringify(page));
    expect(page.items.length).toBeLessThanOrEqual(100);
    page.items.forEach((item) => seen.add(item.id));
    cursor = page.next;
  } while (cursor);

  expect(seen.size).toBe(10000);
  expect(metrics.snapshots).toBeGreaterThan(0);
});
