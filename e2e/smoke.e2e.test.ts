import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const sidebarShows = (name: string) =>
  app.page.evaluate((title) => {
    const aside = [...document.querySelectorAll('aside')].find((a) => !a.closest('[inert]'));

    return aside?.style.width !== '0px' && aside?.querySelector('h2')?.textContent === title;
  }, name);

const clickRail = async (name: string) => {
  if (await sidebarShows(name)) return;

  await app.page.locator(visible(`nav[aria-label="Sidebar views"] button[aria-label="${name}"]`)).click();
  await expect.poll(() => sidebarShows(name)).toBe(true);
};

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('studio smoke test', () => {
  it('adds a shape from the Shapes menu', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();

    expect(await partCount(app.page)).toBe(1);
  });

  it('selects it from Layers and shows it in the Inspector', async () => {
    await clickRail('Layers');
    await app.page.locator(visible('li'), { hasText: 'Cube' }).first().click();

    await expect.poll(() => app.page.locator(visible('input[value="Cube"]')).count()).toBeGreaterThan(0);
  });

  it('duplicates, undoes and redoes', async () => {
    await app.page.keyboard.press('Meta+d');
    expect(await partCount(app.page)).toBe(2);

    await app.page.keyboard.press('Meta+z');
    expect(await partCount(app.page)).toBe(1);

    await app.page.keyboard.press('Meta+Shift+z');
    expect(await partCount(app.page)).toBe(2);
  });

  it('switches every panel without errors', async () => {
    for (const tab of ['Build', 'Agent', 'Inspect']) await clickTab(tab);

    for (const view of ['Parts', 'Robots', 'Library', 'Layers']) await clickRail(view);

    await app.page.keyboard.press('Meta+b');
    await app.page.keyboard.press('Meta+i');
    await app.page.waitForTimeout(400);
    await app.page.keyboard.press('Meta+b');
    await app.page.keyboard.press('Meta+i');
    await app.page.waitForTimeout(400);

    expect(app.errors).toEqual([]);
  });
});

describe('studio commands', () => {
  it('opens and closes the command palette', async () => {
    await app.page.keyboard.press('Meta+k');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  });

  it('opens the part context menu from Layers and closes it', async () => {
    await clickRail('Layers');
    await app.page.locator(visible('li'), { hasText: 'Cube' }).first().click({ button: 'right' });
    await expect.poll(() => app.page.getByRole('menuitem', { name: /Duplicate/ }).count()).toBeGreaterThan(0);
    await app.page.keyboard.press('Escape');
  });

  it('toggles comment mode', async () => {
    const cursor = () => app.page.locator(visible('.canvas-cursor')).evaluate((el) => (el as HTMLElement).style.cursor);
    const idle = await cursor();

    await app.page.keyboard.press('m');
    expect(await cursor()).not.toBe(idle);

    await app.page.keyboard.press('m');
    expect(await cursor()).toBe(idle);
  });

  it('deletes the selected part', async () => {
    const before = await partCount(app.page);

    await app.page.locator(visible('li'), { hasText: 'Cube' }).first().click();
    await app.page.keyboard.press('Backspace');

    await expect.poll(() => partCount(app.page)).toBe(before - 1);
  });

  it('opens Settings and the agent composer', async () => {
    await app.page.keyboard.press('Meta+,');
    await expect.poll(() => app.page.getByRole('dialog').count()).toBeGreaterThan(0);
    await app.page.keyboard.press('Escape');
    await clickTab('Agent');
    await expect.poll(() => app.page.locator(visible('textarea')).count()).toBeGreaterThan(0);

    expect(app.errors).toEqual([]);
  });
});
