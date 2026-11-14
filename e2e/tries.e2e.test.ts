import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  activeCase: string | null;
  tries: Array<{ id: string; robot: string }>;
}

type Studio = {
  simState: () => SimState;
  load: (record: unknown) => void;
  referenceTry: () => Promise<void>;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

const tile = (id: string) => app.page.locator(shown(`[data-testid="try-tile"][data-try-id="${id}"]`));

async function tryInNewScene(name: string): Promise<{ id: string; robot: string }> {
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
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
  await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);

  return (await simState()).tries[0];
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
    const first = await tryInNewScene('Tries scene one');
    const second = await tryInNewScene('Tries scene two');

    expect(second.id).not.toBe(first.id);

    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await app.page.locator(shown('[data-testid="tries-robot"]'), { hasText: first.robot }).first().click();
    await app.page.locator(shown('[data-testid="tries-mode"]')).waitFor();
    await expect.poll(() => tile(first.id).count()).toBe(1);
    await expect.poll(() => tile(second.id).count()).toBe(1);

    await tile(first.id).click();
    await expect.poll(() => tile(first.id).getAttribute('aria-selected')).toBe('true');
    await expect
      .poll(() => app.page.locator(shown('[data-testid="timeline-lane"]')).count(), { timeout: 30000 })
      .toBeGreaterThan(0);

    await tile(second.id).click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Delete' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => tile(second.id).count()).toBe(0);
    await expect.poll(async () => (await simState()).tries.length).toBe(0);
    expect(await tile(first.id).count()).toBe(1);

    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.locator(shown('[data-testid="tries-mode"]')).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
