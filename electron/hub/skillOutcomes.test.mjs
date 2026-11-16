import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startFakeHub } from '../../e2e/fakeHub.ts';
import { HubAccount } from './index.mjs';

let hub;
let dir;

const account = () => {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'skill-outcomes-'));

  const secrets = {
    available: () => true,
    encrypt: (value) => value,
    decrypt: (value) => value,
  };

  return new HubAccount({ libraryDir: dir, secrets, endpoint: () => hub.url });
};

afterEach(async () => {
  await hub?.close();

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  dir = undefined;
});

it('stores feedback offline, publishes in the installer namespace, and deduplicates after restarting', async () => {
  hub = await startFakeHub({ token: 'test', name: 'installer' });

  const first = account();
  const outcome = { source: { repo: 'someone/stand', revision: 'a'.repeat(40) }, result: 'failed' };

  expect(await first.publishSkillOutcome(outcome)).toEqual({ stored: true, published: false });
  expect(await first.skillOutcomes()).toEqual([outcome]);
  await first.signIn('test');
  expect(await first.publishSkillOutcome(outcome)).toEqual({ stored: true, published: true });

  const repos = [...hub.repos];

  expect(repos).toHaveLength(1);
  expect(repos[0][0]).toMatch(/^installer\/basecase-install-[a-f0-9]{64}$/);
  expect(repos[0][1].commits).toHaveLength(1);
  expect(await account().publishSkillOutcome(outcome)).toEqual({ stored: true, published: true });
  expect(repos[0][1].commits).toHaveLength(1);

  const discovery = account();

  discovery.outcomes.dir = path.join(dir, 'another-robot');
  expect(await discovery.skillOutcomes()).toEqual([outcome]);
  expect(hub.requests.some((r) => /\/resolve\/[a-f0-9]{40}\/outcome.json$/.test(r.path))).toBe(true);
});

it('retains signed-in outcomes when publication fails and retries at discovery', async () => {
  hub = await startFakeHub({ token: 'test', failCommit: 'offline' });

  const client = account();

  await client.signIn('test');
  expect(await client.publishSkillOutcome({ status: 'cancelled' })).toEqual({ stored: true, published: false });
  expect(await client.skillOutcomes()).toEqual([{ status: 'cancelled' }]);
  await client.outcomes.pending;
  expect(hub.requests.filter((r) => r.path.endsWith('/commit/main'))).toHaveLength(2);
});

it('publishes a newly stored outcome even when bounded local discovery omits it', async () => {
  hub = await startFakeHub({ token: 'test' });

  const client = account();

  await client.signIn('test');
  client.outcomes.local = () => [];
  expect(await client.publishSkillOutcome({ status: 'passed' })).toEqual({ stored: true, published: true });
  expect([...hub.repos.values()][0].commits).toHaveLength(1);
  expect(await client.publishSkillOutcome({ status: 'passed' })).toEqual({ stored: true, published: true });
  expect([...hub.repos.values()][0].commits).toHaveLength(1);
});

it('rejects oversized records and remote escaped names without constructing downloads', async () => {
  hub = await startFakeHub({ token: 'test' });

  const client = account();

  await expect(client.publishSkillOutcome({ text: 'x'.repeat(256 * 1024) })).rejects.toThrow();
  hub.seed(
    'evil/../../outside',
    {
      'README.md': Buffer.from('---\nlibrary_name: basecase\ntags:\n- basecase-skill-outcome\n---'),
      'outcome.json': Buffer.from('{}'),
    },
    'model',
  );
  expect(await client.skillOutcomes()).toEqual([]);
  expect(hub.requests.every((r) => r.path === '/api/models')).toBe(true);
});
