import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

const SCENE = {
  id: 'scene-gripper',
  name: 'Gripper Test',
  globalGoal: '',
  updatedAt: new Date().toISOString(),
  partCount: 3,
};

let app: App;

beforeAll(async () => {
  app = await openApp({ scenes: [SCENE], 'delete-scene': [] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('scenes menu', () => {
  it('asks before deleting a scene and stays open behind the dialog', async () => {
    const { page } = app;
    const row = page.locator(`[data-scene-row="${SCENE.id}"]`);
    const dialog = page.getByRole('dialog', { name: `Delete ${SCENE.name}?` });
    const search = page.locator('input[aria-label="Search scenes"]');
    const askToDelete = async () => {
      await row.click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await expect.poll(() => dialog.count()).toBe(1);
    };

    await page.locator('button[aria-label="Scenes"]').first().click();
    await expect.poll(() => row.count()).toBe(1);

    await askToDelete();
    expect(await dialog.getByRole('button', { name: /^Close/ }).count()).toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => dialog.count()).toBe(0);
    expect(await row.count()).toBe(1);
    expect(app.posts.some((p) => p.route === 'delete-scene')).toBe(false);

    await askToDelete();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => row.count()).toBe(0);
    expect(app.posts.filter((p) => p.route === 'delete-scene').map((p) => p.body)).toEqual([{ sceneId: SCENE.id }]);
    expect(await search.count()).toBe(1);
    expect(app.errors).toEqual([]);
  });

  it('lines up every label in a menu whose other items lead with an icon', async () => {
    const { page } = app;
    const tab = page.locator('[role="tab"]:has([data-tab-close])').first();

    await tab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close Other Scenes' }).waitFor();

    const lefts = await page
      .getByRole('menu')
      .getByRole('menuitem')
      .evaluateAll((items) => items.map((item) => item.querySelector('.flex-1')?.getBoundingClientRect().left));

    expect(lefts.length).toBeGreaterThan(4);
    expect(new Set(lefts).size).toBe(1);
    await page.keyboard.press('Escape');
  });
});
