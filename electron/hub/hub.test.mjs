import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeHub } from '../../e2e/fakeHub.ts';
import { HubClient } from './hubClient.mjs';
import { HUB_CALLS } from './routes.mjs';
import { HubAccount, hubEndpoint } from './index.mjs';

const TOKEN = 'hf_testTokenThatMustNeverLeak0123456789';

const sealing = {
  available: () => true,
  encrypt: (value) => Buffer.from([...value].reverse().join('')).toString('base64'),
  decrypt: (sealed) => [...Buffer.from(sealed, 'base64').toString()].reverse().join(''),
};

const text = (value) => new TextEncoder().encode(value);

const binary = (size, seed) => Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) % 256);

const dataset = (episodes) => {
  const files = {
    'meta/info.json': text(JSON.stringify({ codebase_version: 'v2.1', total_episodes: episodes })),
    'meta/episodes.jsonl': text('{"episode_index":0}\n'),
    'meta/modality.json': text('{}'),
  };

  for (let i = 0; i < episodes; i += 1) {
    files[`data/chunk-000/episode_00000${i}.parquet`] = binary(3000 + i, i);
    files[`videos/chunk-000/observation.images.scene/episode_00000${i}.mp4`] = binary(5000 + i, i + 7);
  }

  return files;
};

let hub;
let dir;

const account = (options = {}) => {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hub-account-'));

  return new HubAccount({ libraryDir: dir, secrets: sealing, endpoint: () => hub.url, ...options });
};

const filesOnDisk = (root) =>
  fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile());

afterEach(async () => {
  await hub?.close();
  hub = undefined;

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  dir = undefined;
  vi.restoreAllMocks();
});

describe('Hub endpoint', () => {
  it('is huggingface.co unless overridden with https or a loopback http address', () => {
    expect(hubEndpoint('')).toBe('https://huggingface.co');
    expect(hubEndpoint('https://hub.example.com/x')).toBe('https://hub.example.com');
    expect(hubEndpoint('http://127.0.0.1:4321')).toBe('http://127.0.0.1:4321');
    expect(() => hubEndpoint('http://hub.example.com')).toThrow(/https/);
    expect(() => hubEndpoint('http://10.0.0.5:80')).toThrow(/https/);
  });
});

describe('Hugging Face account', () => {
  it('signs in with a write token, keeps it sealed on disk and never hands it back', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const signedIn = await account().signIn(` ${TOKEN} `);

    expect(signedIn).toEqual({ signedIn: true, name: 'tester' });
    expect(JSON.stringify(account().account())).not.toContain(TOKEN);
    expect(account().account()).toEqual({ signedIn: true, name: 'tester' });

    for (const file of filesOnDisk(dir)) expect(fs.readFileSync(path.join(dir, file), 'utf-8')).not.toContain(TOKEN);

    await expect(account().signIn('')).rejects.toThrow(/isn’t a Hugging Face token/);
    expect(account().account()).toEqual({ signedIn: true, name: 'tester' });
  });

  it('refuses a token the Hub rejects or one that can only read, and stores nothing', async () => {
    hub = await startFakeHub({ token: TOKEN });
    await expect(account().signIn('hf_wrong')).rejects.toThrow(/401/);
    await hub.close();

    hub = await startFakeHub({ token: TOKEN, role: 'read' });
    await expect(account().signIn(TOKEN)).rejects.toThrow(/only read/);
    expect(account().account()).toEqual({ signedIn: false, name: null });
  });
});

describe('publishing to the Hub', () => {
  it('creates a dataset repo, uploads binaries through LFS, commits text inline and tags the codebase version', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const files = dataset(2);
    const hubAccount = account();

    await hubAccount.signIn(TOKEN);

    const published = await hubAccount.publish({ name: 'touch-the-dots-dataset', files });
    const repo = hub.repos.get('tester/touch-the-dots-dataset');
    const [commit] = repo.commits;

    expect(published).toEqual({
      repo: 'tester/touch-the-dots-dataset',
      url: `${hub.url}/datasets/tester/touch-the-dots-dataset`,
    });
    expect(repo.kind).toBe('dataset');

    for (const [file, bytes] of Object.entries(files)) expect(new Uint8Array(repo.files.get(file))).toEqual(bytes);

    expect(commit[0]).toEqual({ key: 'header', value: { summary: 'Publish from Basecase', description: '' } });
    expect(commit.filter((l) => l.key === 'file').map((l) => l.value.path)).toEqual([
      'meta/info.json',
      'meta/episodes.jsonl',
      'meta/modality.json',
    ]);
    expect(commit.filter((l) => l.key === 'lfsFile')).toHaveLength(4);
    expect(commit.find((l) => l.key === 'lfsFile').value).toMatchObject({ algo: 'sha256', size: 3000 });
    expect(repo.tags.get('v2.1')).toBe(1);
  });

  it('updates an existing repo: replaces stale episodes, keeps other files, moves the tag', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);
    await hubAccount.publish({ name: 'arm', files: dataset(3) });
    hub.repos.get('tester/arm').files.set('README.md', Buffer.from('# Arm'));
    await hubAccount.publish({ name: 'arm', files: dataset(1) });

    const repo = hub.repos.get('tester/arm');

    expect([...repo.files.keys()].sort()).toEqual(
      [
        '.gitattributes',
        'README.md',
        'data/chunk-000/episode_000000.parquet',
        'meta/episodes.jsonl',
        'meta/info.json',
        'meta/modality.json',
        'videos/chunk-000/observation.images.scene/episode_000000.mp4',
      ].sort(),
    );
    expect(repo.tags.get('v2.1')).toBe(2);
    expect(hub.requests.filter((r) => r.method === 'PUT')).toHaveLength(6);
  });

  it('uploads large files in parts and tags only a dataset with a codebase version', async () => {
    hub = await startFakeHub({ token: TOKEN, multipartOver: 2048 });

    const hubAccount = account();
    const weights = binary(5000, 3);

    await hubAccount.signIn(TOKEN);

    const parquet = 'data/chunk-000/episode_000000.parquet';
    const published = await hubAccount.publish({
      name: 'arm-big',
      files: { [parquet]: weights, 'meta/tasks.jsonl': text('{}') },
    });

    expect(published.url).toBe(`${hub.url}/datasets/tester/arm-big`);
    expect(new Uint8Array(hub.repos.get('tester/arm-big').files.get(parquet))).toEqual(weights);
    expect(hub.requests.filter((r) => r.path.includes('/part/'))).toHaveLength(5);
    expect(hub.repos.get('tester/arm-big').tags.size).toBe(0);
  });

  it('accepts the base64 files the HTTP bridge sends', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);
    await HUB_CALLS['hub:publish'](hubAccount, {
      name: 'over-http',
      files: { 'meta/info.json': Buffer.from('{}').toString('base64') },
    });

    expect(hub.repos.get('tester/over-http').files.get('meta/info.json').toString()).toBe('{}');
  });

  it('never logs the token or puts it in an error, even when the Hub echoes it', async () => {
    hub = await startFakeHub({ token: TOKEN, failCommit: `bad request from Bearer ${TOKEN}` });

    const logged = [];

    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, level).mockImplementation((...args) => logged.push(args.map(String).join(' ')));
    }

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);

    const failure = await hubAccount.publish({ name: 'echo', files: dataset(1) }).catch((e) => e);

    expect(failure.message).toMatch(/500/);
    expect(failure.message).not.toContain(TOKEN);
    expect(logged.join('\n')).not.toContain(TOKEN);
  });
});

describe('publishing refuses crafted names and addresses', () => {
  const CRAFTED = [
    '../../api/repos/delete',
    'evil.com/x',
    'a/b',
    '//evil.com',
    '%2e%2e',
    'name?x=1',
    'name#frag',
    'back\\slash',
    '-leading',
    'double--dash',
    '',
    'x'.repeat(97),
  ];

  it.each(CRAFTED)('rejects the repo name %j before any request', async (name) => {
    hub = await startFakeHub({ token: TOKEN });

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);

    const before = hub.requests.length;

    await expect(hubAccount.publish({ name, files: dataset(1) })).rejects.toThrow(/repo/);
    expect(hub.requests).toHaveLength(before);
  });

  it('rejects a namespace the Hub answers with that would leave the API', async () => {
    hub = await startFakeHub({ token: TOKEN, name: '../../evil' });
    await expect(account().signIn(TOKEN)).rejects.toThrow(/repo/);
    expect(account().account().signedIn).toBe(false);
  });

  it('rejects file paths that climb out of the repo', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);

    for (const bad of ['../x', '/abs', 'a//b', 'a/./b', 'a\\b']) {
      await expect(hubAccount.publish({ name: 'ok', files: { [bad]: text('x') } })).rejects.toThrow(/published/);
    }
  });

  it('says why it refuses an empty publish or one with too many files', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const hubAccount = account();
    const many = Object.fromEntries(Array.from({ length: 20001 }, (_, i) => [`f${i}.txt`, text('x')]));

    await hubAccount.signIn(TOKEN);
    await expect(hubAccount.publish({ name: 'ok', files: {} })).rejects.toThrow('There are no files to publish.');
    await expect(hubAccount.publish({ name: 'ok', files: many })).rejects.toThrow(/at most 20000 files/);
  });

  it('sends uploads to other hosts over https only, without the token, through the public-address guard', async () => {
    hub = await startFakeHub({ token: TOKEN, uploadHost: 'localhost' });

    const hubAccount = account();

    await hubAccount.signIn(TOKEN);
    await expect(hubAccount.publish({ name: 'plain-http', files: dataset(1) })).rejects.toThrow(/https/);
    expect(hub.requests.filter((r) => r.method === 'PUT')).toEqual([]);

    const seen = [];
    const client = new HubClient({
      endpoint: hub.url,
      token: TOKEN,
      outbound: async (url, init) => {
        seen.push(new Headers(init?.headers).get('authorization'));

        return new Response('{}');
      },
    });
    const verify = 'https://uploads.example.com/verify';

    await client.send('https://uploads.example.com/object', { method: 'PUT', body: text('x') });
    await client.send(verify, { method: 'POST', headers: client.verifyHeaders(verify) });
    expect(seen).toEqual([null, null]);
    expect(client.verifyHeaders(`${hub.url}/lfs/x/verify`).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(() => client.url('//evil.example.com/api/whoami-v2')).toThrow(/left/);
    await expect(
      new HubClient({ endpoint: hub.url, token: TOKEN }).send('https://127.0.0.1:1/x', { method: 'PUT' }),
    ).rejects.toThrow(/public/);
  });
});
