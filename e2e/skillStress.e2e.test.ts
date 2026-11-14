import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { kitJob } from '../src/skills/kitJob';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';
import { ARENA_LINE, holdPolicy } from './holdPose';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  simState: () => { conditions: Record<string, number> | null };
  stubTrainer: (policy: unknown) => void;
  stressWith: (options: { budget: number; seed: string }) => void;
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const model = fixtureModel('quad-servo');
const job = kitJob(model, 'stand', { minutes: 1, seed: 0 });
const LEG_SIGN = [1, -1, 1, -1];

const crouched = (rad: number) => {
  const policy = holdPolicy(job, 100);
  const joints = (job.joints as Array<{ id: string }>).map((j) => j.id);

  return {
    ...policy,
    defaultPose: policy.defaultPose.map((d, i) =>
      joints[i].includes('swing') ? d + rad * LEG_SIGN[Number(joints[i][3])] : d,
    ),
  };
};

const stub = (policy: unknown) =>
  app.page.evaluate((p) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(p), policy);

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('stressing a ready skill', () => {
  it('finds where a crouched Stand breaks, replays the break in the live sim, and trains on it', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

    await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), {
      name: 'quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
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
    await stub(crouched(0.75));
    await row.locator('button', { hasText: 'Train' }).click();
    await expect.poll(() => row.innerText(), { timeout: 150000 }).toMatch(ARENA_LINE);

    const ready = (await row.getAttribute('data-skill'))!;

    await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.stressWith({ budget: 24, seed: 'e2e' }),
    );
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Stress Stand');
    await app.page.keyboard.press('Enter');

    const finding = row.getByTestId('stress-finding').first();

    await expect.poll(() => finding.count(), { timeout: 120000 }).toBe(1);

    const point = JSON.parse((await finding.getAttribute('data-point'))!) as Record<string, number>;

    const live = () =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().conditions);

    const gap = async () => {
      const now = await live();

      return now ? Math.max(...Object.keys(point).map((k) => Math.abs(now[k] - point[k]))) : Infinity;
    };

    await finding.click();
    await expect.poll(gap, { timeout: 60000 }).toBeLessThan(1e-4);
    await app.page.locator(visible('button[aria-label="Reset"]')).first().click();
    await expect.poll(live, { timeout: 30000 }).toBeNull();

    await stub(holdPolicy(job, 200));
    await row.locator('button', { hasText: 'Train on These' }).click();
    await expect.poll(() => row.getAttribute('data-skill'), { timeout: 150000 }).not.toBe(ready);
    await expect.poll(() => row.innerText(), { timeout: 60000 }).toMatch(ARENA_LINE);
    expect(app.errors).toEqual([]);
  }, 400000);
});
