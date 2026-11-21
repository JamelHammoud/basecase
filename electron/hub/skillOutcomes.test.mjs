import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
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

it('keeps valid local and remote reports when another report expands beyond the normalized size cap', async () => {
  hub = await startFakeHub({ token: 'test' });

  const client = account();
  const local = { status: 'cancelled' };
  const remote = { status: 'passed' };
  const card = Buffer.from('---\nlibrary_name: basecase\ntags:\n- basecase-skill-outcome\n---');
  const oversized = `[${new Array(15_000).fill('1e20').join(',')}]`;

  await client.publishSkillOutcome(local);
  hub.seed('reporter/expanded', { 'README.md': card, 'outcome.json': Buffer.from(oversized) }, 'model');
  hub.seed('reporter/valid', { 'README.md': card, 'outcome.json': Buffer.from(JSON.stringify(remote)) }, 'model');
  expect(await client.skillOutcomes()).toEqual([local, remote]);
});

it('stops reading local reports at the response cap in hash order', async () => {
  hub = await startFakeHub({ token: 'test' });

  const client = account();
  const entries = await Promise.all(
    Array.from({ length: 105 }, async (_, attempt) => {
      const record = { attempt };

      return { id: await client.outcomes.save(record), record };
    }),
  );
  const saved = vi.spyOn(client.outcomes, 'saved');
  const expected = entries.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 100);

  expect(await client.skillOutcomes()).toEqual(expected.map((entry) => entry.record));
  expect(saved).toHaveBeenCalledTimes(100);
});

it('keeps local reports readable while publication metadata is replaced', async () => {
  hub = await startFakeHub({ token: 'test' });

  const client = account();
  const outcome = { status: 'passed' };

  await client.publishSkillOutcome(outcome);
  await client.signIn('test');

  const rename = fs.promises.rename.bind(fs.promises);
  const replacement = vi.spyOn(fs.promises, 'rename').mockImplementationOnce(async (from, to) => {
    const local = [];

    for await (const saved of client.outcomes.local()) local.push(saved.record);

    expect(local).toEqual([outcome]);
    await rename(from, to);
  });

  try {
    expect(await client.publishSkillOutcome(outcome)).toEqual({ stored: true, published: true });
    expect(replacement).toHaveBeenCalledOnce();
  } finally {
    replacement.mockRestore();
  }
});
