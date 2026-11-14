import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeHub } from '../../e2e/fakeHub.ts';
import { HubAccount } from './index.mjs';
import { SKILL_DOWNLOADS, SKILL_FILE_BYTES } from './skillRepo.mjs';

const TOKEN = 'hf_testTokenThatMustNeverLeak0123456789';

const sealing = {
  available: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (sealed) => Buffer.from(sealed, 'base64').toString(),
};

const inputs = 12 + 3 * 2;
const policy = {
  format: 'basecase-policy',
  version: 1,
  task: 'stand',
  robot: 'quad',
  joints: ['a', 'b'],
  defaultPose: [0, 0],
  actionScale: 0.5,
  controlDt: 0.02,
  command: [0, 0, 0],
  obsMean: new Array(inputs).fill(0),
  obsStd: new Array(inputs).fill(1),
  layers: [{ in: inputs, out: 2, w: new Array(inputs * 2).fill(0), b: [0, 0] }],
  activation: 'elu',
  trainedSteps: 1,
  mujoco: 'stub',
  createdAt: '2026-11-13T00:00:00',
};

const text = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

const skillFiles = () => ({
  'README.md': text('# Stand'),
  ...Object.fromEntries(SKILL_DOWNLOADS.map((p) => [p, text({ file: p })])),
  'policy.json': text(policy),
});

let hub;
let dir;
let other;

const account = (options = {}) => {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'hub-skill-'));

  return new HubAccount({ libraryDir: dir, secrets: sealing, endpoint: () => hub.url, ...options });
};

afterEach(async () => {
  await hub?.close();
  other?.close();
  hub = undefined;
  other = undefined;

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  dir = undefined;
  vi.restoreAllMocks();
});

describe('publishing a skill', () => {
  it('creates a model repo with the policy as ONNX beside policy.json', async () => {
    hub = await startFakeHub({ token: TOKEN });
    await account().signIn(TOKEN);

    const done = await account().publish({ name: 'quad-stand-abc123', files: skillFiles(), kind: 'model' });
    const repo = hub.repos.get('tester/quad-stand-abc123');

    expect(done).toEqual({ repo: 'tester/quad-stand-abc123', url: `${hub.url}/tester/quad-stand-abc123` });
    expect(repo.kind).toBe('model');
    expect([...repo.files.keys()].sort()).toEqual(
      ['.gitattributes', 'README.md', ...SKILL_DOWNLOADS, 'policy.onnx'].sort(),
    );
    expect(repo.files.get('policy.onnx').subarray(0, 2)).toEqual(Buffer.from([0x08, 0x08]));
    expect(hub.requests.some((r) => r.path.startsWith('/api/models/tester/quad-stand-abc123/commit'))).toBe(true);
    expect(hub.requests.some((r) => r.path.startsWith('/api/datasets/'))).toBe(false);
  });

  it('refuses a repo kind it doesn’t know', async () => {
    hub = await startFakeHub({ token: TOKEN });
    await account().signIn(TOKEN);

    await expect(account().publish({ name: 'x', files: skillFiles(), kind: 'space' })).rejects.toThrow(
      'A Hugging Face repo is a dataset or a model.',
    );
  });
});

describe('downloading a skill', () => {
  it('reads every skill file from the repo’s resolve addresses, signed in or not', async () => {
    hub = await startFakeHub({ token: TOKEN });
    await account().signIn(TOKEN);
    await account().publish({ name: 'quad-stand', files: skillFiles(), kind: 'model' });

    const signedOut = new HubAccount({
      libraryDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hub-skill-out-')),
      secrets: sealing,
      endpoint: () => hub.url,
    });
    const got = await signedOut.skillFiles({ owner: 'tester', repo: 'quad-stand', rev: 'main' });
    const resolves = hub.requests.filter((r) => r.path.includes('/resolve/'));

    expect(got.repo).toBe('tester/quad-stand');
    expect(Object.keys(got.files)).toEqual([...SKILL_DOWNLOADS]);
    expect(JSON.parse(got.files['policy.json'])).toEqual(policy);
    expect(resolves.map((r) => r.path)).toEqual(SKILL_DOWNLOADS.map((p) => `/tester/quad-stand/resolve/main/${p}`));
    expect(resolves.every((r) => r.auth === undefined)).toBe(true);
  });

  it('refuses crafted names that would leave the repo, before any request', async () => {
    hub = await startFakeHub({ token: TOKEN });

    for (const ref of [
      { owner: '..', repo: 'x' },
      { owner: 'tester', repo: '../../api/whoami-v2' },
      { owner: 'evil.com:80', repo: 'x' },
      { owner: 'tester', repo: '%2e%2e' },
      { owner: 'tester', repo: 'x', rev: '../../datasets/a/b' },
      { owner: 'tester', repo: 'x', rev: '..' },
      { owner: '@evil.com', repo: 'x' },
    ])
      await expect(account().skillFiles(ref)).rejects.toThrow(/can’t name a Hugging Face repo|isn’t a branch/);

    expect(hub.requests).toEqual([]);
  });

  it('refuses a file over the size cap', async () => {
    hub = await startFakeHub({ token: TOKEN });
    await account().signIn(TOKEN);
    await account().publish({
      name: 'huge',
      files: { ...skillFiles(), 'skill.json': new Uint8Array(SKILL_FILE_BYTES + 1) },
      kind: 'model',
    });

    await expect(account().skillFiles({ owner: 'tester', repo: 'huge' })).rejects.toThrow(
      'skill.json is larger than 34 MB',
    );
  });

  it('follows a redirect off the Hub over https only, through the public-address guard, without the token', async () => {
    const outbound = vi.fn(() => Promise.resolve(new Response('{"ok":true}')));

    other = http.createServer((req, res) => {
      const host = req.url.endsWith('policy.json') ? 'http://cdn.example.com' : 'https://cdn.example.com';

      res.writeHead(302, { Location: `${host}${req.url}` });
      res.end();
    });
    await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
    hub = { url: `http://127.0.0.1:${other.address().port}`, close: async () => {} };

    await expect(account({ outbound }).skillFiles({ owner: 'tester', repo: 'quad-stand' })).rejects.toThrow(
      'Hugging Face sent an address that isn’t https.',
    );
    expect(outbound).toHaveBeenCalledTimes(1);
    expect(outbound.mock.calls[0][0]).toBe('https://cdn.example.com/tester/quad-stand/resolve/main/skill.json');
    expect(JSON.stringify(outbound.mock.calls)).not.toContain('Bearer');
  });
});
