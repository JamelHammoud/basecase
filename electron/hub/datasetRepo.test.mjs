import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitSha, startFakeHub } from '../../e2e/fakeHub.ts';
import { DATASET_FILE_BYTES } from './datasetRepo.mjs';
import { HubAccount } from './index.mjs';

const TOKEN = 'hf_testTokenThatMustNeverLeak0123456789';
const SHA = 'a'.repeat(40);

const sealing = {
  available: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (sealed) => Buffer.from(sealed, 'base64').toString(),
};

const text = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

const binary = (size, seed) => Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) % 256);

const wanted = () => ({
  'meta/info.json': text({ codebase_version: 'v3.0', total_episodes: 1 }),
  'meta/tasks.jsonl': text('{"task_index":0,"task":"push"}\n'),
  'meta/stats.json': text({}),
  'meta/tasks.parquet': binary(300, 1),
  'meta/episodes/chunk-000/file-000.parquet': binary(500, 2),
  'data/chunk-000/file-000.parquet': binary(2000, 3),
});

const lerobotDataset = () => ({
  ...wanted(),
  '.gitattributes': text('*.parquet filter=lfs\n'),
  'README.md': text('# Push T'),
  'videos/observation.images.top/chunk-000/file-000.mp4': binary(4000, 4),
  'meta/notes.txt': text('x'),
  'data/chunk-000/file-000.csv': text('a,b'),
});

let hub;
let dir;
let other;

const account = () => {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hub-dataset-'));

  return new HubAccount({ libraryDir: dir, secrets: sealing, endpoint: () => hub.url });
};

const decoded = (files) => Object.fromEntries(Object.entries(files).map(([p, b]) => [p, Buffer.from(b)]));

async function serve(reply) {
  const requests = [];

  other = http.createServer((req, res) => {
    requests.push(req.url);
    reply(req, res);
  });
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  hub = { url: `http://127.0.0.1:${other.address().port}`, requests, close: async () => {} };
}

const sendJson = (res, body, headers = {}) => {
  res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

afterEach(async () => {
  await hub?.close();
  other?.closeAllConnections();
  other?.close();
  hub = undefined;
  other = undefined;

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  dir = undefined;
});

describe('downloading a dataset', () => {
  it('reads only the meta and data files at the revision’s commit, without a token when signed out', async () => {
    hub = await startFakeHub({ token: TOKEN });
    hub.seed('lerobot/push-t', lerobotDataset());

    const got = await account().datasetFiles({ owner: 'lerobot', repo: 'push-t' });
    const sha = commitSha('lerobot/push-t', 1);
    const resolves = hub.requests.filter((r) => r.path.includes('/resolve/'));

    expect(got.repo).toBe('lerobot/push-t');
    expect(got.revision).toBe(sha);
    expect(decoded(got.files)).toEqual(
      Object.fromEntries(Object.entries(wanted()).map(([p, b]) => [p, Buffer.from(b)])),
    );
    expect(hub.requests.slice(0, 2).map((r) => r.path)).toEqual([
      '/api/datasets/lerobot/push-t/revision/main',
      `/api/datasets/lerobot/push-t/tree/${sha}`,
    ]);
    expect(resolves.map((r) => r.path).sort()).toEqual(
      Object.keys(wanted())
        .map((p) => `/datasets/lerobot/push-t/resolve/${sha}/${p}`)
        .sort(),
    );
    expect(hub.requests.some((r) => /\.(mp4|md|txt|csv)$|gitattributes/.test(r.path))).toBe(false);
    expect(hub.requests.every((r) => r.auth === undefined)).toBe(true);
  });

  it('sends the token to the Hub when signed in', async () => {
    hub = await startFakeHub({ token: TOKEN });
    hub.seed('lerobot/push-t', lerobotDataset());
    await account().signIn(TOKEN);
    hub.requests.length = 0;

    await account().datasetFiles({ owner: 'lerobot', repo: 'push-t', rev: 'main' });

    expect(hub.requests.length).toBeGreaterThan(2);
    expect(hub.requests.every((r) => r.auth === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('follows the listing’s next pages', async () => {
    hub = await startFakeHub({ token: TOKEN, treePage: 3 });
    hub.seed('lerobot/push-t', lerobotDataset());

    const got = await account().datasetFiles({ owner: 'lerobot', repo: 'push-t' });

    expect(Object.keys(got.files).sort()).toEqual(Object.keys(wanted()).sort());
    expect(hub.requests.filter((r) => r.path.includes('/tree/'))).toHaveLength(4);
  });

  it('returns no files for a repo without meta/info.json', async () => {
    hub = await startFakeHub({ token: TOKEN });
    hub.seed('someone/arm-urdf', { 'robot.urdf': text('<robot/>'), 'data/x.parquet': binary(10, 1) });

    const got = await account().datasetFiles({ owner: 'someone', repo: 'arm-urdf' });

    expect(got).toEqual({ repo: 'someone/arm-urdf', revision: commitSha('someone/arm-urdf', 1), files: {} });
    expect(hub.requests.some((r) => r.path.includes('/resolve/'))).toBe(false);
  });

  it('refuses a file over 256 MB', async () => {
    hub = await startFakeHub({ token: TOKEN });
    hub.seed('lerobot/huge', {
      ...wanted(),
      'data/chunk-000/file-001.parquet': new Uint8Array(DATASET_FILE_BYTES + 1),
    });

    await expect(account().datasetFiles({ owner: 'lerobot', repo: 'huge' })).rejects.toThrow(
      'data/chunk-000/file-001.parquet is larger than 256 MB',
    );
  });

  it('refuses a dataset over 1 GB or 2,000 files before downloading any of it', async () => {
    hub = await startFakeHub({ token: TOKEN });

    const big = new Uint8Array(220 * 1000 * 1000);
    const many = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`data/f${i}.parquet`, binary(1, i)]));

    hub.seed('lerobot/big', {
      ...wanted(),
      ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`data/b${i}.parquet`, big])),
    });
    hub.seed('lerobot/many', { ...wanted(), ...many });

    await expect(account().datasetFiles({ owner: 'lerobot', repo: 'big' })).rejects.toThrow(
      'That dataset is over 1 GB. Download it and import the folder.',
    );
    await expect(account().datasetFiles({ owner: 'lerobot', repo: 'many' })).rejects.toThrow(
      'That dataset has over 2,000 files. Download it and import the folder.',
    );
    expect(hub.requests.some((r) => r.path.includes('/resolve/'))).toBe(false);
  });
});

describe('dataset download exploits', () => {
  it('refuses crafted accounts, repos and revisions that try to leave the Hub, before any request', async () => {
    hub = await startFakeHub({ token: TOKEN });

    for (const ref of [
      { owner: '../../evil', repo: 'x' },
      { owner: 'evil.com/x', repo: 'x' },
      { owner: 'a/b', repo: 'x' },
      { owner: 'tester', repo: '%2e%2e' },
      { owner: 'x@evil.com', repo: 'x' },
      { owner: '--x', repo: 'x' },
      { owner: 'tester', repo: 'x'.repeat(200) },
      { owner: 'tester', repo: '../../api/whoami-v2' },
      { owner: 'tester', repo: 'x', rev: 'a/b' },
      { owner: 'tester', repo: 'x', rev: '..' },
      { owner: 'tester', repo: 'x', rev: '../../models/a/b' },
      { owner: 'tester', repo: 'x', rev: '%2e%2e' },
    ])
      await expect(account().datasetFiles(ref)).rejects.toThrow(/can’t name a Hugging Face repo|isn’t a branch/);

    expect(hub.requests).toEqual([]);
  });

  it('skips listed paths that climb out of the repo or aren’t plain', async () => {
    hub = await startFakeHub({ token: TOKEN });
    hub.seed('lerobot/push-t', {
      ...wanted(),
      'data/../meta/escape.parquet': binary(10, 1),
      'meta/..\\escape.json': text({}),
      '/meta/absolute.json': text({}),
      'data//double.parquet': binary(10, 2),
      'data/%2e%2e/encoded.parquet': binary(10, 3),
    });

    const got = await account().datasetFiles({ owner: 'lerobot', repo: 'push-t' });

    expect(Object.keys(got.files).sort()).toEqual(Object.keys(wanted()).sort());
    expect(hub.requests.some((r) => /escape|absolute|double|encoded|%2e/i.test(r.path))).toBe(false);
  });

  it('refuses a revision reply that isn’t a commit sha', async () => {
    await serve((req, res) => sendJson(res, { sha: '../../api/whoami-v2' }));

    await expect(account().datasetFiles({ owner: 'lerobot', repo: 'push-t' })).rejects.toThrow(
      'Hugging Face didn’t name a commit for that revision.',
    );
    expect(hub.requests).toEqual(['/api/datasets/lerobot/push-t/revision/main']);
  });

  it('follows a next page only on the same listing', async () => {
    await serve((req, res) => {
      if (req.url.includes('/revision/')) return sendJson(res, { sha: SHA });

      sendJson(res, [{ type: 'file', path: 'robot.urdf', size: 1 }], { Link: '</api/whoami-v2>; rel="next"' });
    });

    await expect(account().datasetFiles({ owner: 'lerobot', repo: 'push-t' })).resolves.toEqual({
      repo: 'lerobot/push-t',
      revision: SHA,
      files: {},
    });
    expect(hub.requests).toEqual([
      '/api/datasets/lerobot/push-t/revision/main',
      `/api/datasets/lerobot/push-t/tree/${SHA}?recursive=true`,
    ]);
  });
});
