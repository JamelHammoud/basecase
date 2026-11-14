import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  simState: () => { activeCase: string | null; tries: Array<{ id: string }> };
  load: (record: unknown) => void;
  referenceTry: () => Promise<void>;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const referenceTry = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

const tiles = () => app.page.locator(shown('[data-testid="tries-mode"] [data-testid="try-tile"]'));

async function recordTry(name: string) {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();

  const card = app.page.locator(shown('[data-testid="new-case"]'));
  const dots = card.getByLabel('Dots');

  await dots.fill('2');
  await dots.press('Enter');
  await card.locator('button', { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toBe('touch-the-dots');
  await referenceTry();
  await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);

  return (await simState()).tries[0].id;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Tries in the Library', () => {
  itUnlessWindows(
    'lists tries from two scenes, opens one on its timeline and deletes another',
    async () => {
      const first = await recordTry('First Arm');
      const second = await recordTry('Second Arm');

      expect(first).not.toBe(second);
      expect((await simState()).tries.map((t) => t.id)).toEqual([second]);

      await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();

      const section = app.page.locator(shown('[data-testid="library-tries"]'));

      await expect.poll(() => section.locator('button').first().innerText()).toContain('2 tries');
      await section.locator('button').first().click();
      await expect.poll(() => tiles().count()).toBe(2);
      expect(await tiles().evaluateAll((els) => els.map((el) => el.getAttribute('data-try')).sort())).toEqual(
        [first, second].sort(),
      );

      await tiles().first().click();
      await expect
        .poll(() => app.page.locator(shown('[data-testid="tries-mode"] [data-testid="timeline-lane"]')).count(), {
          timeout: 30000,
        })
        .toBeGreaterThan(0);

      const lanes = app.page.locator(shown('[data-testid="tries-mode"] [data-testid="timeline-lane"]'));

      expect(await lanes.locator('[data-testid="trace-position"]').count()).toBeGreaterThan(0);
      expect(await lanes.locator('[data-testid="trace-effort"], [data-testid="trace-limit"]').count()).toBe(0);

      const gone = await tiles().nth(1).getAttribute('data-try');

      await tiles().nth(1).click({ button: 'right' });
      await app.page.getByRole('menuitem', { name: 'Delete' }).click();
      await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect.poll(() => tiles().count()).toBe(1);
      expect(await tiles().first().getAttribute('data-try')).not.toBe(gone);

      await app.page.keyboard.press('Escape');
      await app.page.keyboard.press('Escape');
      await expect.poll(() => app.page.locator(shown('[data-testid="tries-mode"]')).count()).toBe(0);
      expect(app.errors).toEqual([]);
    },
    240000,
  );
});
