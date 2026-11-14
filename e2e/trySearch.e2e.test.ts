import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StoredTry } from '../src/cases/tryFile';
import { openApp, shown, type App } from './harness';
import { SEARCH_FIXTURES, storedFixture } from './trySearchFixtures';

let app: App;

type Studio = {
  keepStoredTries: (tries: StoredTry[]) => Promise<void>;
  searchTries: (query: string) => Promise<Array<{ try: string; segment: string | null }>>;
};

const studio = () => (window as unknown as { __studio: Studio }).__studio;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const tileOrder = () =>
  app.page
    .locator(shown('[data-testid="try-results"] [data-testid="try-tile"]'))
    .evaluateAll((tiles) => tiles.map((t) => t.getAttribute('data-try')));

describe('Searching tries', () => {
  it('finds the planted segments from the Library and ranks grasps with More Like This', async () => {
    const tries = SEARCH_FIXTURES.map((f) => storedFixture(f));

    await app.page.evaluate((list) => studio().keepStoredTries(list), tries);
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await app.page.locator(shown('input[aria-label="Search library"]')).fill('failed grasp red block leader-arm');

    const rows = app.page.locator(shown('[data-testid="library-try-hits"] button'));

    await expect.poll(() => rows.count()).toBe(2);
    expect(await rows.allInnerTexts()).toEqual([
      expect.stringContaining('Grasp red block'),
      expect.stringContaining('Grasp red block'),
    ]);

    await rows.first().click();
    await expect.poll(() => tileOrder()).toEqual(expect.arrayContaining(['pick-failed-1', 'pick-failed-2']));
    expect(await tileOrder()).toHaveLength(2);

    await app.page.locator(shown('input[aria-label="Search tries"]')).fill('');
    await app.page.locator(shown('[data-testid="try-tile"][data-try="grasp-1"]')).click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'More Like This' }).click();

    await expect.poll(async () => (await tileOrder()).slice(0, 3).sort()).toEqual(['grasp-2', 'grasp-3', 'grasp-4']);
    expect(await tileOrder()).not.toContain('walk');
    expect(await tileOrder()).not.toContain('grasp-1');

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('tries-mode').count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
