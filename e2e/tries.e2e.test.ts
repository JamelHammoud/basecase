import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  simState: () => { drive: string; activeCase: string | null; tries: Array<{ id: string }> };
  load: (r: unknown) => void;
};

type Tabs = { open: () => void; list: () => { ids: string[]; activeId: string } };

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

async function recordTry(): Promise<string> {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();

  const card = app.page.locator(shown('[data-testid="new-case"]'));

  await card.locator('button', { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).not.toBeNull();
  await button('Try It').click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down('w');
  await app.page.waitForTimeout(600);
  await app.page.keyboard.up('w');
  await button('Stop Try').click();
  await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

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
  itUnlessWindows('lists tries from two scenes, opens one on the timeline and deletes one', async () => {
    const first = await recordTry();

    await app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.open());
    await expect.poll(() => partCount(app.page)).toBe(0);

    const second = await recordTry();
    const rail = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

    await rail.click();
    await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();

    const tile = (id: string) => app.page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`));

    await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(2);
    await expect.poll(() => tile(first).count()).toBe(1);

    await tile(second).click();
    await expect.poll(() => app.page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBeGreaterThan(0);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('try-timeline').count()).toBe(0);

    await tile(first).click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Delete' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(1);
    expect(await tile(second).count()).toBe(1);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('tries-mode').count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
