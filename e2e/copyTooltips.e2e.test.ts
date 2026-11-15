import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('copy in tooltips', () => {
  it('keeps the exit shortcut without repeating the visible action', async () => {
    await app.page.keyboard.press('d');

    const done = app.page.getByTestId('measure-done').filter({ visible: true });

    await done.waitFor({ state: 'visible' });
    expect(await done.textContent()).toBe('Done');
    await done.hover();

    const tooltip = app.page.getByRole('tooltip');

    await tooltip.waitFor({ state: 'visible' });
    expect(await tooltip.textContent()).toBe('Esc');
    expect(await tooltip.locator('kbd').textContent()).toBe('Esc');
    await app.page.keyboard.press('Escape');
    await done.waitFor({ state: 'hidden' });
    expect(app.errors).toEqual([]);
  });
});
