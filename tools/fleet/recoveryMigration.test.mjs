import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client, Pool } from 'pg';
import { postgresFixture, freePort } from './postgres.mjs';
import { recoveryCommand } from './recoveryCommand.mjs';
import { bootstrap } from '../../src/fleet/service/identity.mjs';
import { database } from '../../src/fleet/service/database.mjs';
import { startService } from '../../src/fleet/service/http.mjs';

let postgres;
let root;
let pool;
let service;
let url;
let identity;
const schema = `recovery_${randomUUID().replaceAll('-', '')}`;
const robot = randomUUID();
const site = randomUUID();

beforeAll(async () => {
  postgres = await postgresFixture();
  root = new Client({ connectionString: postgres.url });
  await root.connect();
  await root.query("SELECT set_config('basecase.recovery_schema',$1,false)", [schema]);
  await root.query(
    "DO $$ BEGIN EXECUTE format('CREATE SCHEMA %I', current_setting('basecase.recovery_schema')); END $$",
  );

  const scoped = new URL(postgres.url);

  scoped.searchParams.set('options', `-csearch_path=${schema}`);
  url = scoped.href;
  pool = new Pool({ connectionString: url });

  const sql = await readFile(new URL('../../src/fleet/service/migrations.sql', import.meta.url), 'utf8');

  await pool.query(sql.split('CREATE TABLE IF NOT EXISTS fleet_recovery (')[0]);
  identity = await bootstrap(pool, {
    name: 'Legacy hospital',
    email: 'legacy@example.test',
    password: 'legacy-password-long',
  });
  await pool.query(
    "INSERT INTO fleet_resources(org,id,kind,parent,ancestors,data) VALUES ($1,$2,'site',NULL,ARRAY[$1::uuid],$4),($1,$3,'robot',$2,ARRAY[$1::uuid,$2::uuid],$5)",
    [identity.org, site, robot, { name: 'Ward' }, { name: 'Original delivery' }],
  );
});

afterAll(async () => {
  await service?.close();
  await pool?.end();
  await root?.query(
    "DO $$ BEGIN EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', current_setting('basecase.recovery_schema')); END $$",
  );
  await root?.end();
  await postgres?.close();
});

it('migrates a legacy organization through the local command and authorizes its unchanged inventory over HTTP', async () => {
  const setup = await recoveryCommand(url, 'recovery-setup', identity.org, {
    email: 'recovery@example.test',
    password: 'legacy-recovery-password',
  });

  expect(setup.code).toBe(0);
  await pool.end();
  pool = await database(url);

  const origin = `http://127.0.0.1:${await freePort()}`;

  service = await startService({ pool, origin });

  const response = await fetch(`${origin}/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org: identity.org, email: 'recovery@example.test', password: 'legacy-recovery-password' }),
  });
  const session = await response.json();
  const inventory = await fetch(`${origin}/v1/${identity.org}/robot`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });

  expect(response.status).toBe(200);
  expect((await inventory.json()).items.map((item) => item.id)).toEqual([robot]);
  expect((await pool.query('SELECT id FROM fleet_organizations')).rows).toEqual([{ id: identity.org }]);
  expect((await pool.query('SELECT 1 FROM fleet_recovery_audit WHERE org=$1', [identity.org])).rowCount).toBe(1);
});
