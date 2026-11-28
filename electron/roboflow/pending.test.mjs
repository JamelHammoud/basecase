import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startFakeRoboflow } from '../../e2e/fakeRoboflow.ts';
import { RoboflowAccount } from './index.mjs';
import { roboflowPostRoutes, registerRoboflowHandlers } from './routes.mjs';

const KEY = 'roboflow-test-private-key';
const PROJECT = 'https://app.roboflow.com/workspace/project';
const cleanups = [];

async function setup(exportReply) {
  const fake = await startFakeRoboflow({ key: KEY, exportReply });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roboflow-pending-'));
  const rf = new RoboflowAccount({ libraryDir: dir, secrets: { available: () => false }, endpoint: () => fake.url });

  rf.keys.set('roboflow', KEY);
  cleanups.push(async () => {
    await fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return { fake, rf };
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

it.each([
  { status: 202, body: { progress: 42 } },
  { status: 200, body: { ready: false } },
  { status: 200, body: { progress: 0 } },
  { status: 202, body: {} },
])('keeps pending replies bounded and out of archive downloads: %j', async (exportReply) => {
  const { fake, rf } = await setup(exportReply);
  const pending = await rf.importProject(PROJECT);

  expect(pending).toMatchObject({
    kind: 'pending',
    continuation: { workspace: 'workspace', project: 'project', version: 2, format: 'coco' },
  });
  expect(Buffer.byteLength(JSON.stringify(pending))).toBeLessThan(512);
  expect(JSON.stringify(pending)).not.toContain(KEY);
  expect(pending).not.toHaveProperty('data');
  expect(fake.requests.map((r) => r.path)).toEqual(['/workspace/project', '/workspace/project/2/coco']);

  const again = await rf.importProject(pending.continuation);

  expect(again).toEqual(pending);
  expect(fake.requests.map((r) => r.path)).toEqual([
    '/workspace/project',
    '/workspace/project/2/coco',
    '/workspace/project/2/coco',
  ]);
});

it.each([PROJECT, `${PROJECT}/2`])('continues the original version after latest changes: %s', async (link) => {
  const { fake, rf } = await setup({ status: 202, body: { progress: 10 } });
  const pending = await rf.importProject(link);

  fake.advance({ latest: 9, exportReply: undefined });

  const done = await rf.importProject(pending.continuation);

  expect(done.name).toBe('project-v2.zip');
  expect([...done.data]).toEqual([80, 75, 3, 4]);
  expect(fake.requests.slice(-2)).toEqual([
    { path: '/workspace/project/2/coco', key: KEY },
    { path: '/archive.zip', key: null },
  ]);
  expect(fake.requests.filter((r) => r.path === '/workspace/project')).toHaveLength(Number(link === PROJECT));
});

it('carries pending and complete replies through HTTP and IPC', async () => {
  const { fake, rf } = await setup({ status: 202, body: { progress: 25 } });
  const route = roboflowPostRoutes(rf).find(([name]) => name === '/roboflow-import')[1];
  const handlers = new Map();

  registerRoboflowHandlers({ handle: (name, call) => handlers.set(name, call) }, rf);

  const pending = await route({ arg: PROJECT });

  expect(await handlers.get('roboflow:import')(null, pending.continuation)).toEqual(pending);
  fake.advance({ exportReply: undefined });
  expect(await route({ arg: pending.continuation })).toEqual({
    kind: 'complete',
    name: 'project-v2.zip',
    data: 'UEsDBA==',
  });
});

it.each([null, '42', -1, 101, {}, [50]])('rejects malformed progress without downloading: %j', async (progress) => {
  const { fake, rf } = await setup({ status: 202, body: { progress } });

  await expect(rf.importProject(`${PROJECT}/2`)).rejects.toThrow('Roboflow');
  expect(fake.requests.map((r) => r.path)).toEqual(['/workspace/project/2/coco']);
});

it.each([{}, { ready: true }, { ready: 'false' }, { export: { link: 'https://attacker.example/archive.zip' } }])(
  'rejects malformed or hostile completion: %j',
  async (body) => {
    const { fake, rf } = await setup({ status: 200, body });

    await expect(rf.importProject(`${PROJECT}/2`)).rejects.toThrow('Roboflow');
    expect(fake.requests.map((r) => r.path)).toEqual(['/workspace/project/2/coco']);
  },
);

it('rejects forged identities before requesting and never retains provider metadata', async () => {
  const { fake, rf } = await setup({ status: 202, body: { progress: 20, api_key: KEY, extra: 'x'.repeat(10000) } });
  const pending = await rf.importProject(PROJECT);
  const count = fake.requests.length;

  for (const patch of [
    { version: 9 },
    { workspace: 'other' },
    { project: '../other' },
    { format: 'yolo' },
    { signature: '0'.repeat(64) },
    { key: KEY },
  ]) {
    await expect(rf.importProject({ ...pending.continuation, ...patch })).rejects.toThrow();
  }

  expect(fake.requests).toHaveLength(count);
  expect(Buffer.byteLength(JSON.stringify(pending))).toBeLessThan(512);
  expect(JSON.stringify(pending)).not.toContain(KEY);
});

it('refuses an export URL that embeds the saved API key', async () => {
  const { fake, rf } = await setup();

  fake.advance({ exportLink: `${fake.url}/archive.zip?key=${KEY}` });
  await expect(rf.importProject(`${PROJECT}/2`)).rejects.toThrow('Roboflow download');
  expect(fake.requests.map((r) => r.path)).toEqual(['/workspace/project/2/coco']);
});

it('bounds retained metadata at the maximum validated identity lengths', async () => {
  const { fake, rf } = await setup({ status: 202, body: { progress: 99.12345678901234 } });
  const workspace = 'w'.repeat(128);
  const project = 'p'.repeat(128);
  const pending = await rf.importProject(`https://app.roboflow.com/${workspace}/${project}/999999`);

  expect(Buffer.byteLength(JSON.stringify(pending))).toBeLessThan(512);
  expect(fake.requests.map((request) => request.path)).toEqual([`/${workspace}/${project}/999999/coco`]);
});
