import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

const shown = (selector: string) => `${selector}:not([inert] *):visible`;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Library', () => {
  it('saves the scene from the New Model menu in the view header', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    expect(await partCount(app.page)).toBe(1);

    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();

    const header = app.page.locator(shown('aside div:has(> h2)'), { hasText: 'Library' });

    await header.getByRole('button', { name: 'New model' }).click();
    await app.page.getByRole('menuitem', { name: 'Save Whole Scene' }).click();

    await expect.poll(() => app.posts.some((p) => p.route === 'save-model')).toBe(true);
    expect(await app.page.locator(shown('aside')).getByText('Models', { exact: true }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
