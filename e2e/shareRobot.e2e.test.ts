import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { startFakeHub, type FakeHub } from './fakeHub';
import { exposeTestHooks, launchChrome, openApp, openPlayTab, partCount, shown, type App } from './harness';

const HUB_TOKEN = 'hf_e2eFakeHubToken';
const FILE = 'basecase-robot.json';

let app: App;
let hub: FakeHub;
let web: Browser;

type Studio = {
  load: (r: unknown) => void;
  simState: () => { activeCase: string | null };
  sharedLink: () => string | null;
};

const sharedLink = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sharedLink());

const activeCase = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().activeCase);

const gallery = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __gallery?: {
            state: () => { status: string; drive: string; stats: { robots: Array<{ forward: number }> } | null };
          };
        }
      ).__gallery?.state() ?? null,
  );

async function openRoverCase() {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Desk Rover',
    parts: rover.parts,
    project: { ...DEFAULT_PROJECT, joints: rover.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
  await openPlayTab(app.page, 'Cases');
  await app.page.locator(shown('button'), { hasText: 'New Case' }).first().click();

  const card = app.page.locator(shown('[data-testid="new-case"]'));

  await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
  await card.locator('button', { hasText: 'Create' }).click();
  await expect.poll(() => activeCase()).toBe('reach-a-spot');

  return rover;
}

async function shareFromCommandBar() {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Share Robot');
  await app.page.keyboard.press('Enter');
}

async function signInIfAsked() {
  const token = app.page.locator(shown('input[aria-label="Access token"]'));
  const signedOut = await token.waitFor({ timeout: 10000 }).then(
    () => true,
    () => false,
  );

  if (!signedOut) return;

  await token.fill(HUB_TOKEN);
  await token.press('Enter');
  await expect
    .poll(() => app.page.locator(shown('[role=dialog][aria-label=Settings]')).innerText())
    .toContain('tester');
  await app.page.keyboard.press('Escape');
  await shareFromCommandBar();
}

async function openLink(link: string, bundle: Buffer) {
  const page = await web.newPage({ viewport: { width: 1440, height: 900 } });
  const { pathname } = new URL(link);
  const asked: string[] = [];
  const errors: string[] = [];

  await exposeTestHooks(page);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => asked.push(r.url()));
  await page.route('https://huggingface.co/**', (route) => {
    const want = `https://huggingface.co/datasets${pathname.slice(2)}/resolve/main/${FILE}`;

    return route.request().url() === want
      ? route.fulfill({ status: 200, body: bundle, headers: { 'Access-Control-Allow-Origin': '*' } })
      : route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto(`${inject('webUrl')}${pathname}`);

  return { page, asked, errors };
}

beforeAll(async () => {
  hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  app = await openApp({}, ['hub-']);
  await app.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: inject('appUrl') });
  web = await launchChrome();
}, 120000);

afterAll(async () => {
  await web?.close();
  await app?.close();
  await hub?.close();
});

describe('Share Robot', () => {
  it.skipIf(process.platform === 'win32')(
    'publishes the rover from ⌘K, and the link drives it in the browser and opens it in the studio',
    async () => {
      const rover = await openRoverCase();

      await shareFromCommandBar();
      await signInIfAsked();
      await expect
        .poll(() => sharedLink(), { timeout: 120000 })
        .toMatch(/^https:\/\/app\.basecase\.so\/r\/tester\/desk-rover-[0-9a-f]{6}$/);

      const link = (await sharedLink())!;
      const repo = hub.repos.get(link.split('/r/')[1])!;
      const bundle = repo.files.get(FILE)!;

      expect(repo.kind).toBe('dataset');
      expect(JSON.parse(bundle.toString()).case.id).toBe('reach-a-spot');
      expect(await app.page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await expect
        .poll(() => app.page.getByRole('status').filter({ hasText: 'Link copied' }).count())
        .toBeGreaterThan(0);
      expect(app.errors).toEqual([]);

      const { page, asked, errors } = await openLink(link, bundle);
      const card = page.getByTestId('gallery-card');

      await expect.poll(() => card.count(), { timeout: 60000 }).toBe(1);
      expect(await card.innerText()).toContain('Reach a Spot');
      await expect.poll(() => page.locator('#boot').count()).toBe(0);
      await expect.poll(async () => (await gallery(page))?.status, { timeout: 60000 }).toBe('ready');
      await card.getByRole('button', { name: 'Drive', exact: true }).click();
      await expect.poll(async () => (await gallery(page))?.drive, { timeout: 30000 }).toBe('on');
      await page.mouse.click(900, 450);
      await page.keyboard.down('w');
      await expect
        .poll(async () => (await gallery(page))?.stats?.robots[0].forward ?? 0, { timeout: 20000 })
        .toBeGreaterThan(0.1);
      await page.keyboard.up('w');
      expect(asked.filter((url) => url.includes('huggingface.co'))).toEqual([
        `https://huggingface.co/datasets/${link.split('/r/')[1]}/resolve/main/${FILE}`,
      ]);
      expect(errors).toEqual([]);

      await card.getByRole('button', { name: 'See Inside' }).click();
      await page.waitForURL(`${inject('webUrl')}/`);
      await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
        timeout: 60000,
      });
      await expect.poll(() => partCount(page)).toBe(rover.parts.length);
      await page.close();
    },
    300000,
  );
});
