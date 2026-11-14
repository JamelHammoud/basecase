import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { kitJob } from '../src/skills/kitJob';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';
import { holdPolicy } from './holdPose';

type Physics = { friction: number; mass: number; strength: number; latencyMs: number };

let app: App;

const SWING_RAD = 0.745;
const LEG_SIGN = [1, -1, 1, -1];
const job = kitJob(fixtureModel('quad-servo'), 'stand', { minutes: 1, seed: 0 });

function swungStand() {
  const policy = holdPolicy(job, 100);

  return {
    ...policy,
    defaultPose: policy.defaultPose.map((d, i) =>
      policy.joints[i].includes('swing') ? d + SWING_RAD * LEG_SIGN[Number(policy.joints[i][3])] : d,
    ),
  };
}

const studio = (name: string, arg?: unknown) =>
  app.page.evaluate(
    ({ name, arg }) =>
      (window as unknown as { __studio: Record<string, (a?: unknown) => unknown> }).__studio[name](arg),
    { name, arg },
  );

const physics = () => studio('simState').then((s) => (s as { physics: Physics | null }).physics);

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
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
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('stressing a ready skill', () => {
  it('finds where Stand breaks from ⌘K, replays the finding in the live sim, and trains on it', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

    await studio('load', {
      name: 'quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();

    const row = app.page.locator(visible('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

    await expect.poll(() => row.count(), { timeout: 60000 }).toBe(1);
    await studio('stubTrainer', swungStand());
    await row.locator('button', { hasText: 'Train' }).click();
    await expect.poll(() => row.innerText(), { timeout: 150000 }).toMatch(/^\d+ of 32 tries/m);

    const ready = await row.getAttribute('data-skill');

    await studio('stressBudget', 24);
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Stress Stand');
    await app.page.keyboard.press('Enter');

    const finding = row.getByTestId('stress-finding').first();

    await expect.poll(() => finding.count(), { timeout: 120000 }).toBe(1);
    expect(await finding.innerText()).toMatch(/^Link mass > ×1\.\d\d, margin −0\.\d\d$/);

    const boundary = Number(/×(\d\.\d\d)/.exec(await finding.innerText())![1]);

    await finding.click();
    await expect.poll(physics, { timeout: 60000 }).toMatchObject({ friction: 1, strength: 1, latencyMs: 0 });
    expect((await physics())!.mass).toBeGreaterThan(boundary);

    await studio('stubTrainer', holdPolicy(job, 200));
    await row.click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Train on These' }).click();
    await expect.poll(() => row.getAttribute('data-skill'), { timeout: 200000 }).not.toBe(ready);
    await expect.poll(() => row.innerText(), { timeout: 60000 }).toContain('of 32 tries');
    expect(await row.getByTestId('stress-finding').count()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 500000);
});
