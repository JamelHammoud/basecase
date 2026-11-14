import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { kitJob } from '../src/skills/kitJob';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { startFakeHub, type FakeHub } from './fakeHub';
import { openApp, partCount, shown, type App } from './harness';
import { holdPolicy } from './holdPose';

const HUB_TOKEN = 'hf_e2eFakeHubToken';

type Studio = {
  load: (r: unknown) => void;
  stubTrainer: (policy: unknown) => void;
};

let app: App;
let hub: FakeHub;

const studio = () => (window as unknown as { __studio: Studio }).__studio;

const tabCount = () => app.page.locator(shown('[role="tab"]:has([data-tab-close])')).count();

const standRow = () => app.page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

const toast = (text: RegExp) => app.page.getByRole('status').filter({ hasText: text });

const savedSkills = () =>
  app.posts
    .filter((p) => p.route === 'skill-save')
    .map((p) => p.body as { hash: string; text: string })
    .filter((b) => typeof b?.hash === 'string');

async function openFixture(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => studio().load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await expect.poll(() => standRow().count(), { timeout: 60000 }).toBe(1);
  await app.page.evaluate(
    (policy) => studio().stubTrainer(policy),
    holdPolicy(kitJob(fixtureModel(id), 'stand', { minutes: 1, seed: 0 })),
  );
}

async function publishFromMenu() {
  const publish = app.page.locator(shown('[role=menuitem]'), { hasText: 'Publish to Hugging Face' });
  const token = app.page.locator(shown('input[aria-label="Access token"]'));
  const outcome = toast(/Published to|Couldn’t publish/);

  await standRow().click({ button: 'right' });
  await publish.click();
  await token
    .or(toast(/Publishing skill/))
    .or(outcome)
    .first()
    .waitFor({ timeout: 10000 });

  if (await token.isVisible()) {
    await token.fill(HUB_TOKEN);
    await token.press('Enter');
    await expect
      .poll(() => app.page.locator(shown('[role=dialog][aria-label=Settings]')).innerText())
      .toContain('tester');
    await app.page.keyboard.press('Escape');
    await standRow().click({ button: 'right' });
    await publish.click();
  }

  await outcome.first().waitFor({ timeout: 60000 });

  return outcome.first().innerText();
}

async function installSkill(link: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Install Skill');
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: 'Install Skill' }).waitFor();
  await app.page.keyboard.press('Enter');

  const field = app.page.locator(shown('input[aria-label="Skill link"]'));

  await field.fill(link);
  await field.press('Enter');
}

beforeAll(async () => {
  hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } }, ['hub-']);
  await app.page.route(
    (url) => url.pathname === '/api/bridge/skill',
    (route) => {
      const hash = new URL(route.request().url()).searchParams.get('hash');
      const saved = savedSkills().find((s) => s.hash === hash);

      return route.fulfill({ status: 200, contentType: 'application/json', body: saved?.text ?? 'null' });
    },
  );
}, 120000);

afterAll(async () => {
  await app?.close();
  await hub?.close();
});

describe('skills on the Hugging Face Hub', () => {
  it('publishes a ready Stand from its row and installs it on a hexapod from ⌘K, proved there', async () => {
    await openFixture('quad-servo');
    await standRow().locator('button', { hasText: 'Train' }).click();
    await expect.poll(() => standRow().innerText(), { timeout: 150000 }).toContain('of 32 tries');

    const quadStand = savedSkills().at(-1)!;
    const said = await publishFromMenu();
    const repo = /Published to (\S+)/.exec(said)?.[1] ?? '';
    const files = [...(hub.repos.get(repo)?.files.keys() ?? [])];

    expect(repo).toMatch(/^tester\/.+-stand-[0-9a-f]{6}$/);
    expect(hub.repos.get(repo)?.kind).toBe('model');
    expect(files).toEqual(
      expect.arrayContaining([
        'README.md',
        'skill.json',
        'policy.json',
        'policy.onnx',
        'contract.json',
        'environment.json',
        'evidence.json',
        'robot.json',
      ]),
    );
    expect(JSON.parse(hub.repos.get(repo)!.files.get('skill.json')!.toString())).toEqual(JSON.parse(quadStand.text));

    const tabs = await tabCount();

    await app.page.keyboard.press('ControlOrMeta+t');
    await expect.poll(tabCount).toBe(tabs + 1);
    await expect.poll(() => partCount(app.page)).toBe(0);
    await openFixture('hexapod');
    expect(await standRow().innerText()).not.toContain('of 32 tries');
    await installSkill(`https://huggingface.co/${repo}`);
    await toast(/Training Stand from/)
      .first()
      .waitFor({ timeout: 30000 });
    await expect.poll(() => standRow().innerText(), { timeout: 150000 }).toContain('of 32 tries');

    const installed = JSON.parse(savedSkills().at(-1)!.text);

    expect(installed.warmStartFrom).toBe(quadStand.hash);
    expect(installed.binding.physics).not.toBe(JSON.parse(quadStand.text).binding.physics);
    expect(installed.evidence.passed).toBe(true);
    expect(installed.evidence).not.toEqual(JSON.parse(quadStand.text).evidence);
    expect(JSON.stringify(app.posts)).not.toContain(HUB_TOKEN);
    expect(app.errors).toEqual([]);
  }, 420000);
});
