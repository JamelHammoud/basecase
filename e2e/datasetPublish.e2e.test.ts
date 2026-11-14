import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { SimState, Studio } from './driveStudio';
import { startFakeHub, type FakeHub } from './fakeHub';
import { endTryAt, expectPublished, loadFixtureRobot } from './driveChecks';
import { openApp, openPlayTab, type App } from './harness';

const HUB_TOKEN = 'hf_e2eFakeHubToken';
const SHORT_TRY_SECONDS = 0.4;

let app: App;
let hub: FakeHub;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const datasetPane = () => app.page.getByTestId('dataset-pane');

async function reopenDataset() {
  if (await datasetPane().count()) return;

  await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(visible('[data-testid="library-datasets"] button')).first().click();
  await expect.poll(() => datasetPane().count()).toBe(1);
}

async function passedTry() {
  await loadFixtureRobot(app.page, 'arm-3dof');
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();
  await app.page.locator(visible('[data-testid="new-case"] button'), { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toMatch(/^touch-a-point/);
  await button('Try It').click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await endTryAt(app.page, SHORT_TRY_SECONDS);
  await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.passTries());
}

beforeAll(async () => {
  hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  app = await openApp({}, ['hub-']);
}, 120000);

afterAll(async () => {
  await app?.close();
  await hub?.close();
});

describe('Publish a dataset', () => {
  it.skipIf(process.platform === 'win32')(
    'publishes a dataset of a passed try to Hugging Face after signing in from Settings, tagged with its version',
    async () => {
      const publish = () => button('Publish to Hugging Face');
      const commitsOf = (name: string) => hub.repos.get(name)?.commits.length ?? 0;
      const ours = () => [...hub.repos.keys()].filter((name) => /^tester\/touch-a-point-[0-9a-f]{6}$/.test(name));
      const token = app.page.locator(visible('input[aria-label="Access token"]'));
      const toast = (text: RegExp) => app.page.getByRole('status').filter({ hasText: text });
      const outcome = toast(/Published to|Couldn’t publish|as it is now/);

      await passedTry();
      await expect.poll(() => button('Make Dataset').count()).toBe(1);
      expect(await publish().count()).toBe(0);
      await button('Make Dataset').click();
      await expect.poll(() => datasetPane().count()).toBe(1);
      await expect.poll(() => publish().count()).toBe(1);

      await publish().click();
      await token
        .or(toast(/Publishing dataset/))
        .or(outcome)
        .first()
        .waitFor({ timeout: 10000 });

      if (await token.isVisible()) {
        await token.fill(HUB_TOKEN);
        await token.press('Enter');
        await expect
          .poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings]')).innerText())
          .toContain('tester');
        await app.page.keyboard.press('Escape');
        await reopenDataset();
        await publish().dblclick();
      }

      await outcome.first().waitFor({ timeout: 120000 });

      const said = await outcome.first().innerText();
      const [repo] = ours();

      expect(said).toMatch(/^Published to /);
      expect(ours()).toHaveLength(1);
      expect(said).toContain(repo);
      expect(commitsOf(repo)).toBe(2);
      await expectPublished(hub, repo);
      await expect.poll(() => hub.repos.get(repo)!.tags.get('dataset-v1')).toBe(commitsOf(repo));
      expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain(HUB_TOKEN);
      expect(JSON.stringify(app.posts)).not.toContain(HUB_TOKEN);
      expect(app.errors).toEqual([]);
    },
    180000,
  );
});
