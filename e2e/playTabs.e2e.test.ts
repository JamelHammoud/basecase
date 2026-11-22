import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp } from './bodyExperimentHarness';
import { narrowBodyMotionPanel } from './bodyMotionLayout';
import { playTab, shown, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openBodyExperimentApp({ evidence: false });
  await narrowBodyMotionPanel(app.page);
});
afterAll(async () => {
  await app?.close();
});

it('keeps the selected Play tab inside the narrow sidebar and clickable after Library', async () => {
  const { page } = app;

  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Play"]')).click();

  const tab = page.locator(shown(playTab('Operate'))).first();

  await expect
    .poll(() =>
      tab.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        const list = button.closest('[role="tablist"]')!.getBoundingClientRect();
        const center = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

        return {
          inside: bounds.left >= list.left - 1 && bounds.right <= list.right + 1,
          clickable: !!center && button.contains(center),
        };
      }),
    )
    .toEqual({ inside: true, clickable: true });
  await tab.click();
  expect(await tab.getAttribute('aria-selected')).toBe('true');
  expect(app.errors).toEqual([]);
});
