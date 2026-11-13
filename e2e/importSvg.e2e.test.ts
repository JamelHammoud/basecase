import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

const button = (name: string) => app.page.getByRole('button', { name, exact: true }).filter({ visible: true });

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('import svg', () => {
  it('adds the drawing to the scene with one Add, and leaves saving to the Inspector', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Import SVG');
    await app.page.keyboard.press('Enter');
    await button('Slotted Link Arm').click();
    await expect.poll(() => button('Add').count()).toBe(1);
    expect(await button('Add & Save').count()).toBe(0);

    const before = await partCount(app.page);

    await button('Add').click();
    await expect.poll(() => partCount(app.page)).toBe(before + 1);
    await expect.poll(() => button('Save to Library').count()).toBe(1);
    expect(app.posts.some((p) => p.route === 'save-model')).toBe(false);
    expect(app.errors).toEqual([]);
  });
});
