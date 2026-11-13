import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Objects', () => {
  it('lists its categories under the search field and opens one as a scoped search', async () => {
    const { page } = app;

    await page.locator('nav[aria-label="Sidebar views"] button[aria-label="Objects"]').first().click();

    const search = page.locator('input[aria-label="Search objects"]:visible');
    const kitchen = page.locator('button:visible', { hasText: 'Mugs, pans, knives, cutting boards' });

    await expect.poll(() => kitchen.isVisible(), { timeout: 20000 }).toBe(true);
    expect(await page.locator('text="Browse"').count()).toBe(0);

    await kitchen.click();
    await expect.poll(() => search.getAttribute('placeholder')).toBe('Search kitchen');

    await search.press('Escape');
    await expect.poll(() => search.getAttribute('placeholder')).toBe('Search objects');
    await expect.poll(() => kitchen.isVisible()).toBe(true);
  });
});
