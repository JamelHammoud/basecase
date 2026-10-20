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

  it('asks before deleting a comment or a thread', async () => {
    const dialog = app.page.getByRole('dialog');
    const parts = await partCount(app.page);
    const comment = (text: string) => app.page.locator('p', { hasText: text });
    const box = (await app.page.locator(visible('.canvas-cursor canvas')).boundingBox())!;

    await app.page.keyboard.press('m');
    await app.page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.75);
    await app.page.getByPlaceholder('Add a comment').fill('First note');
    await app.page.keyboard.press('Enter');
    await app.page.getByPlaceholder('Reply').fill('Second note');
    await app.page.keyboard.press('Enter');

    await comment('First note').hover();
    await app.page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect.poll(() => dialog.getAttribute('aria-label')).toBe('Delete comment?');
    await app.page.keyboard.press('Backspace');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await partCount(app.page)).toBe(parts);
    expect(await comment('First note').count()).toBe(1);

    await app.page.getByRole('button', { name: 'Delete thread' }).click();
    await expect.poll(() => dialog.getAttribute('aria-label')).toBe('Delete thread #1?');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => comment('Second note').count()).toBe(0);
    await app.page.keyboard.press('m');

    expect(app.errors).toEqual([]);
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

  it('picks the agent model and effort in the composer and sends them with the prompt', async () => {
    const picker = app.page.locator(visible('button[aria-label^="Model:"]'));
    const effort = app.page.locator(visible('input[aria-label="Effort"]'));

    await expect.poll(() => picker.getAttribute('aria-label')).toBe('Model: Default');
    await picker.click();
    await app.page.locator(visible('[role=menuitem]'), { hasText: 'Sonnet 5.5' }).click();
    await expect.poll(() => picker.getAttribute('aria-label')).toBe('Model: Sonnet 5.5');
    await expect.poll(() => effort.inputValue()).toBe('3');
    await effort.focus();
    await app.page.keyboard.press('ArrowLeft');
    await expect.poll(() => effort.inputValue()).toBe('2');
    await app.page.locator(visible('[role=menuitem]'), { hasText: 'Haiku 5.5' }).click();
    await expect.poll(() => effort.count()).toBe(0);
    await app.page.locator(visible('[role=menuitem]'), { hasText: 'Sonnet 5.5' }).click();
    await app.page.locator(visible('textarea')).fill('Desk lamp arm');
    await app.page.keyboard.press('Enter');

    const prompt = () =>
      app.posts.find((p) => p.route === 'acp-prompt')?.body as { model?: string; effort?: string } | undefined;

    await expect.poll(() => prompt()?.model).toBe('sonnet');
    expect(prompt()?.effort).toBe('high');
    await expect
      .poll(() => app.page.evaluate(() => localStorage.getItem('agent-choices')))
      .toBe(JSON.stringify({ claude: { model: 'sonnet', effort: 'high' } }));
    expect(app.errors).toEqual([]);
  });
});
