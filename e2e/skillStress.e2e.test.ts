import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { standingPolicy } from '../src/skills/stressFixtures';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

type Conditions = { friction: number; mass: number; strength: number; latencyMs: number };

type Studio = {
  load: (r: unknown) => void;
  simState: () => { conditions: Conditions | null };
  stubTrainer: (policy: unknown) => void;
  stressBudget: (budget: number | null) => void;
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const stub = (policy: unknown) =>
  app.page.evaluate((p) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(p), policy);

const conditions = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().conditions);

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
}, 120000);

afterAll(async () => {
  await app?.close();
});

async function readyStand() {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
  const record = { name: 'quad', parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } };

  await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), record);
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await app.page.route(
    (url) => url.pathname === '/api/bridge/skill',
    (route) => {
      const hash = new URL(route.request().url()).searchParams.get('hash');
      const saved = app.posts
        .filter((p) => p.route === 'skill-save')
        .map((p) => p.body as { hash: string; text: string })
        .find((b) => b.hash === hash);

      return route.fulfill({ status: 200, contentType: 'application/json', body: saved?.text ?? 'null' });
    },
  );

  const row = app.page.locator(visible('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

  await expect.poll(() => row.count(), { timeout: 60000 }).toBe(1);
  await stub(standingPolicy(fixtureModel('quad-servo'), { stiffness: 3 }));
  await row.locator('button', { hasText: 'Train' }).click();
  await expect.poll(() => row.innerText(), { timeout: 150000 }).toContain('of 32 tries');

  return row;
}

describe('stressing a ready skill', () => {
  it('finds a stiff Stand’s servo-delay limit from ⌘K, replays it in the live sim, and Train on These keeps a sturdier one', async () => {
    const row = await readyStand();
    const stiff = await row.getAttribute('data-skill');

    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.stressBudget(24));
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Stress Stand');
    await app.page.keyboard.press('Enter');

    const finding = row.getByTestId('stress-finding').first();

    await expect.poll(() => finding.count(), { timeout: 150000 }).toBe(1);
    expect(await finding.getAttribute('data-axis')).toBe('latencyMs');

    const boundary = Number(/^Delay > (\d+) ms/.exec(await finding.innerText())?.[1]);

    expect(boundary).toBeGreaterThan(40);
    await finding.click();
    await expect.poll(conditions, { timeout: 60000 }).toMatchObject({ friction: 1, mass: 1, strength: 1 });
    expect((await conditions())!.latencyMs).toBeGreaterThan(boundary);

    await stub(standingPolicy(fixtureModel('quad-servo')));
    await row.locator('button', { hasText: 'Train on These' }).click();
    await expect.poll(() => row.getAttribute('data-skill'), { timeout: 200000 }).not.toBe(stiff);
    await expect.poll(() => row.innerText(), { timeout: 60000 }).toContain('of 32 tries');
    expect(await row.getByTestId('stress-finding').count()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 480000);
});
