import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeHub } from '../../e2e/fakeHub.ts';
import { fixtureModel } from '../../src/skills/fixtureModels.ts';
import { publishedSkillFiles } from '../../src/skills/hubSkill.ts';
import { readyStand } from '../../src/skills/hubSkillFixtures.ts';
import { kitEnvironment } from '../../src/skills/kitEnvironment.ts';
import { HubAccount } from './index.mjs';
import { gitBlob } from './gitBlob.mjs';
import { SKILL_DOWNLOADS, SKILL_FILE_BYTES } from './skillRepo.mjs';

let hub;
let dir;

const files = () => {
  const model = fixtureModel('quad-servo');

  return publishedSkillFiles({ skill: readyStand(model, 'quad'), environment: kitEnvironment(model, 'stand'), model });
};

const account = () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-search-'));

  return new HubAccount({ libraryDir: dir, secrets: {}, endpoint: () => hub.url });
};

afterEach(async () => {
  await hub?.close();

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  vi.restoreAllMocks();
});

describe('finding published skills through the Hub', () => {
  it('uses the Git blob protocol digest', () => {
    expect(gitBlob(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
  it('finds tagged and legacy skills, verifies the policy blob, and caches only two files by commit', async () => {
    hub = await startFakeHub({ token: 'test' });
    hub.seed('tester/tagged', files(), 'model');
    hub.seed(
      'tester/legacy',
      { ...files(), 'README.md': new TextEncoder().encode('---\nlibrary_name: basecase\n---') },
      'model',
    );
    hub.seed('tester/tampered', { ...files(), 'policy.json': new TextEncoder().encode('{}') }, 'model');

    const client = account();
    const [first, simultaneous] = await Promise.all([client.findSkills(), client.findSkills()]);
    const resolves = () => hub.requests.filter((r) => r.path.includes('/resolve/'));

    expect(simultaneous).toEqual(first);
    expect(first.map((r) => r.repo)).toEqual(['tester/legacy', 'tester/tagged']);
    expect(client.skillSearch.cachedBytes).toBe(
      first.reduce(
        (sum, result) => sum + Object.values(result.files).reduce((n, text) => n + Buffer.byteLength(text), 0),
        0,
      ),
    );
    expect(resolves().every((r) => /\/(robot|skill)\.json$/.test(r.path))).toBe(true);
    expect(first.every((r) => /^[a-f0-9]{40}$/.test(r.revision))).toBe(true);

    const count = resolves().length;

    expect(await client.findSkills()).toEqual(first);
    expect(resolves()).toHaveLength(count);
    hub.seed('tester/tagged', { ...files(), 'policy.json': new TextEncoder().encode('{}') }, 'model');
    expect((await client.findSkills()).map((r) => r.repo)).toEqual(['tester/legacy']);
  });

  it('refuses an escaped repository name before any file request', async () => {
    hub = await startFakeHub({ token: 'test' });
    hub.seed('evil/../../elsewhere', files(), 'model');

    expect(await account().findSkills()).toEqual([]);
    expect(hub.requests.every((r) => r.path === '/api/models')).toBe(true);
  });

  it('drops incomplete packages before downloading candidate files', async () => {
    hub = await startFakeHub({ token: 'test' });

    for (const missing of SKILL_DOWNLOADS) {
      const incomplete = files();

      delete incomplete[missing];
      hub.seed(`tester/missing-${missing}`, incomplete, 'model');
    }

    expect(await account().findSkills()).toEqual([]);
    expect(hub.requests.some((r) => r.path.includes('/resolve/'))).toBe(false);
  });

  it('drops oversized robot.json and returns an empty list when offline', async () => {
    hub = await startFakeHub({ token: 'test' });
    hub.seed('tester/huge', { ...files(), 'robot.json': new Uint8Array(SKILL_FILE_BYTES + 1) }, 'model');

    const client = account();

    expect(await client.findSkills()).toEqual([]);
    await hub.close();
    expect(await client.findSkills()).toEqual([]);
  });
});
