import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { datasetFiles, touchingPolicy } from './driveChecks';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  tries: Array<{ passed: boolean }>;
  controller: { kind: string };
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  passTries: () => void;
  stubTrainer: (policy: unknown) => void;
  datasets: () => Array<{ name: string; query: string | null; members: string[]; versions: unknown[] }>;
};

const TRIES = 5;
const SHORT_TRY_SECONDS = 0.4;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const stubTrainer = (policy: unknown) =>
  app.page.evaluate((stub) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(stub), policy);

async function endTryAt(seconds: number) {
  await app.page.evaluate(async (at) => {
    const clock = () =>
      [...document.querySelectorAll('[data-testid="try-clock"]')].find((el) => !el.closest('[inert]'));
    const elapsed = () => Number.parseFloat(clock()?.textContent ?? '') || 0;
    const deadline = Date.now() + 30000;

    while (elapsed() < at) {
      if (Date.now() > deadline) throw new Error(`The try clock never reached ${at} s`);

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    clock()?.parentElement?.querySelector('button')?.click();
  }, seconds);
}

async function openTouchAPoint() {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: arm.id,
    parts: arm.parts,
    project: { ...DEFAULT_PROJECT, joints: arm.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();
  await app.page.locator(visible('[data-testid="new-case"] button'), { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toMatch(/^touch-a-point/);
}

async function driveTries() {
  for (let n = 1; n <= TRIES; n++) {
    await button('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await endTryAt(SHORT_TRY_SECONDS);
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(n);
    await expect.poll(async () => (await simState()).drive, { timeout: 30000 }).toBe('off');
  }
}

const datasets = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.datasets());

async function runCommand(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.getByLabel('Search commands').fill(label);
  await app.page.locator(visible('button[data-idx]')).filter({ hasText: label }).first().click();
}

async function datasetFromSearch(query: string) {
  await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.getByLabel('Search library').fill(query);
  await app.page.locator(visible('[data-testid="library-tries"] button')).first().click();
  await expect.poll(() => app.page.locator(visible('[data-testid="try-tile"]')).count()).toBe(TRIES);
  await runCommand('Make Dataset');
  await expect.poll(() => app.page.getByTestId('dataset-pane').count()).toBe(1);
}

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
  await app.page.route(
    (url) => url.pathname === '/api/bridge/skill',
    (route) => {
      const saved = app.posts.filter((p) => p.route === 'skill-save').at(-1)?.body as { text?: string } | undefined;

      return route.fulfill({ status: 200, contentType: 'application/json', body: saved?.text ?? '{}' });
    },
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Train from Tries', () => {
  it.skipIf(process.platform === 'win32')(
    'makes a dataset from a search, exports it, refuses a policy the Case fails and keeps one it passes as a ready skill',
    async () => {
      const policy = touchingPolicy();
      const still = { ...policy, layers: [{ ...policy.layers[0], b: policy.layers[0].b.map(() => 0) }] };
      const trainFromTries = () => button('Train from Tries');
      const result = app.page.locator(visible('[data-testid="tries-policy"]'));
      const skill = app.page.locator(visible('[data-testid="skill-row"]'), { hasText: 'Touch a Point' });

      await openTouchAPoint();
      await driveTries();
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.passTries());
      await expect.poll(() => button('Make Dataset').count()).toBe(1);

      for (const moved of ['Export Dataset', 'Publish to Hugging Face', 'Train from Tries'])
        expect(await button(moved).count()).toBe(0);

      await datasetFromSearch('Touch a Point');

      const [made] = await datasets();
      const files = await datasetFiles(app.page);

      expect(made).toMatchObject({ name: 'Touch a Point', query: 'Touch a Point' });
      expect(made.members).toHaveLength(TRIES);
      expect(JSON.parse(files['meta/info.json'].toString()).total_episodes).toBe(TRIES);
      expect((await datasets())[0].versions).toHaveLength(1);

      await stubTrainer(still);
      await trainFromTries().click();
      await expect.poll(() => result.count(), { timeout: 180000 }).toBe(1);
      expect(await result.getAttribute('data-kept')).toBe('false');
      expect(await result.innerText()).toMatch(/^\d+ of 32/);
      await expect.poll(() => result.locator('img').count(), { timeout: 60000 }).toBe(1);
      expect(await skill.count()).toBe(0);

      await stubTrainer(policy);
      await runCommand('Train from Tries');
      await expect.poll(() => result.getAttribute('data-kept'), { timeout: 180000 }).toBe('true');
      expect(await result.innerText()).toMatch(/^(29|30|31|32) of 32$/);
      expect((await datasets())[0].versions).toHaveLength(1);

      await expect.poll(() => skill.first().innerText(), { timeout: 60000 }).toMatch(/of 32 tries/);
      await skill.first().locator('button', { hasText: 'Try' }).click();
      await expect.poll(async () => (await simState()).controller.kind, { timeout: 60000 }).toBe('policy');
      expect(app.errors).toEqual([]);
    },
    300000,
  );
});
