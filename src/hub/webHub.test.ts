import { afterEach, expect, it, vi } from 'vitest';
import { startFakeHub } from '../../e2e/fakeHub';
import { publishedSkillFiles } from '../skills/hubSkill';
import { readyStand } from '../skills/hubSkillFixtures';
import { fixtureModel } from '../skills/fixtureModels';
import { kitEnvironment } from '../skills/kitEnvironment';
import { SkillSearch } from './skillSearch.mjs';
import { skillFiles } from './skillDownloads.mjs';
import { AnonymousHubClient } from './anonymousHubClient';

let hub: Awaited<ReturnType<typeof startFakeHub>> | undefined;

afterEach(async () => {
  await hub?.close();
  vi.restoreAllMocks();
});

it('discovers anonymously and installs the selected commit after main changes', async () => {
  hub = await startFakeHub({ token: 'test' });

  const model = fixtureModel('quad-servo');
  const files = publishedSkillFiles({
    skill: readyStand(model, 'quad'),
    environment: kitEnvironment(model, 'stand'),
    model,
  });

  hub.seed('tester/stand', files, 'model');

  const client = new AnonymousHubClient(hub.url);
  const [candidate] = await new SkillSearch().find(client);

  expect(candidate.repo).toBe('tester/stand');
  hub.seed('tester/stand', { ...files, 'policy.json': new TextEncoder().encode('{}') }, 'model');

  const installed = await skillFiles(client, { owner: 'tester', repo: 'stand', rev: candidate.revision });

  expect(installed.revision).toBe(candidate.revision);
  expect(installed.files['policy.json']).toBe(new TextDecoder().decode(files['policy.json']));
  expect(hub.requests.every((request) => !request.auth)).toBe(true);
});

it('refuses hostile refs and prohibited redirects before downloading a payload', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://private.example/policy' } }));
  const client = new AnonymousHubClient();

  await expect(skillFiles(client, { owner: '..', repo: 'stand', rev: 'main' })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    client.download('/tester/stand/resolve/main/skill.json', { maxBytes: 1024, label: 'skill.json' }),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('reads a production commit directly from the Hub cache and checks its revision header', async () => {
  const commit = 'a'.repeat(40);
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { headers: { 'x-repo-commit': commit } }));
  const client = new AnonymousHubClient();

  await client.download(`/tester/stand/resolve/${commit}/skill.json`, { maxBytes: 1024, label: 'skill.json' });
  expect(String(fetcher.mock.calls[0][0])).toBe(
    `https://huggingface.co/api/resolve-cache/models/tester/stand/${commit}/skill.json`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'manual' });
  fetcher.mockResolvedValue(new Response('{}', { headers: { 'x-repo-commit': 'b'.repeat(40) } }));
  await expect(
    client.download(`/tester/stand/resolve/${commit}/skill.json`, { maxBytes: 1024, label: 'skill.json' }),
  ).rejects.toThrow();
});
