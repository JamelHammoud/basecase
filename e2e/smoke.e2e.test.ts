import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const sidebarShows = (name: string) =>
  app.page.evaluate((title) => {
    const aside = [...document.querySelectorAll('aside')].find((a) => !a.closest('[inert]'));

    return aside?.style.width !== '0px' && aside?.querySelector('h2')?.textContent === title;
  }, name);

const blurFocus = () => (document.activeElement as HTMLElement | null)?.blur();

const fillDiffersFromPanel = (row: Element) => {
  const probe = document.createElement('div');

  probe.style.background = 'var(--color-panel-bg)';
  row.after(probe);

  const panel = getComputedStyle(probe).backgroundColor;

  probe.remove();

  return getComputedStyle(row).backgroundColor !== panel;
};

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
  it('loads cross-origin isolated, from the built bundle when there is one', async () => {
    const fromSource = app.requests.some((url) => new URL(url).pathname.startsWith('/src/'));

    expect(await app.page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(fromSource).toBe(inject('served') === 'dev');
  });

  it('leaves part exports out of ⌘K until the scene has parts', async () => {
    const command = (name: string) => app.page.getByRole('button', { name, exact: true });
    const searchExports = async () => {
      await app.page.keyboard.press('Meta+k');
      await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
      await app.page.keyboard.type('export');
      await expect.poll(() => command('Export Scene').count()).toBe(1);
    };

    await searchExports();
    expect(await command('Export STL').count()).toBe(0);
    expect(await command('Export 3MF Plates').count()).toBe(0);
    await app.page.keyboard.press('Escape');

    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    await searchExports();
    expect(await command('Export STL').count()).toBe(1);
    expect(await command('Export 3MF Plates').count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Meta+z');
    await expect.poll(() => partCount(app.page)).toBe(0);
  });

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

describe('Layers rows', () => {
  it('runs a Layers name under its row toggles and keeps Show while the part is hidden', async () => {
    await clickRail('Layers');

    const row = app.page.locator(visible('[data-layer-row^="part:"]'), { hasText: 'Cube' }).first();
    const nameRight = () => row.locator('span.truncate').evaluate((el) => el.getBoundingClientRect().right);
    const rowRight = () => row.evaluate((el) => el.getBoundingClientRect().right);

    await row.locator('span.truncate').click({ position: { x: 4, y: 4 } });
    await app.page.mouse.move(0, 0);
    await expect.poll(() => row.evaluate(fillDiffersFromPanel)).toBe(true);
    expect((await rowRight()) - (await nameRight())).toBeLessThan(16);

    await row.hover();
    await row.getByRole('button', { name: 'Hide' }).click();
    await app.page.mouse.move(0, 0);
    await app.page.evaluate(blurFocus);

    const show = row.getByRole('button', { name: 'Show' });

    await expect.poll(() => show.evaluate((el) => el.checkVisibility({ opacityProperty: true }))).toBe(true);

    await row.hover();
    await show.click();
    await app.page.mouse.move(0, 0);

    const hide = row.getByRole('button', { name: 'Hide' });

    await expect.poll(() => hide.evaluate((el) => el.checkVisibility({ opacityProperty: true }))).toBe(false);
  });
});

describe('command menu', () => {
  it('names the query when nothing matches', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('zzqx');
    await expect.poll(() => app.page.getByText('No matches for “zzqx”').count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByLabel('Search commands').count()).toBe(0);
  });

  it('duplicates and deletes the selection, like its right-click menu', async () => {
    const run = async (name: string) => {
      await app.page.keyboard.press('Meta+k');
      await app.page.getByLabel('Search commands').fill(name);
      await app.page.keyboard.press('Enter');
    };

    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();

    const before = await partCount(app.page);

    await run('Duplicate');
    await expect.poll(() => partCount(app.page)).toBe(before + 1);
    await run('Delete');
    await expect.poll(() => partCount(app.page)).toBe(before);
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

  it('aligns a part from the context menu and closes it', async () => {
    const xs = () =>
      app.page.evaluate(() =>
        (window as unknown as { __studio: { sceneRecord: () => { parts: Array<{ position: number[] }> } } }).__studio
          .sceneRecord()
          .parts.map((p) => p.position[0]),
      );
    const before = await xs();

    await app.page.locator(visible('li'), { hasText: 'Cube' }).first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Align', exact: true }).hover();
    await app.page.getByRole('button', { name: 'Left to origin' }).click();

    await expect.poll(xs).not.toEqual(before);
    await expect.poll(() => app.page.getByRole('menuitem', { name: /Duplicate/ }).count()).toBe(0);
  });

  it('toggles comment mode', async () => {
    const cursor = () => app.page.locator(visible('.canvas-cursor')).evaluate((el) => (el as HTMLElement).style.cursor);
    const idle = await cursor();

    await app.page.keyboard.press('m');
    expect(await cursor()).not.toBe(idle);

    await app.page.keyboard.press('m');
    expect(await cursor()).toBe(idle);
  });

  it('asks before deleting a comment or a reply, and undoes a deleted reply', async () => {
    const dialog = app.page.getByRole('dialog');
    const parts = await partCount(app.page);
    const comment = (text: string) => app.page.locator('p', { hasText: text });
    const box = (await app.page.locator(visible('.canvas-cursor canvas')).boundingBox())!;

    await app.page.keyboard.press('m');
    await app.page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.75);
    await app.page.getByPlaceholder('e.g. Move this hole 2 mm left').fill('First note');
    await app.page.keyboard.press('Enter');
    await app.page.getByPlaceholder('e.g. Moved it 2 mm').fill('Second note');
    await app.page.keyboard.press('Enter');

    await comment('First note').hover();
    await app.page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect.poll(() => dialog.getAttribute('aria-label')).toBe('Delete comment?');
    await app.page.keyboard.press('Backspace');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await partCount(app.page)).toBe(parts);
    expect(await comment('First note').count()).toBe(1);

    await comment('Second note').hover();
    await app.page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => comment('Second note').count()).toBe(0);
    expect(await app.page.getByRole('button', { name: 'Delete', exact: true }).count()).toBe(0);
    await app.page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => comment('Second note').count()).toBe(1);

    await app.page.getByRole('button', { name: 'Delete comment' }).click();
    await expect.poll(() => dialog.getAttribute('aria-label')).toBe('Delete comment #1?');
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

  it('keeps every keystroke in the composer and fades it once it scrolls', async () => {
    const box = app.page.locator(visible('textarea'));
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);

    await box.click();

    for (const [i, line] of lines.entries()) {
      if (i) await app.page.keyboard.press('Shift+Enter');

      await app.page.keyboard.type(line);
    }

    expect(await box.inputValue()).toBe(lines.join('\n'));
    await expect.poll(() => box.evaluate((el) => getComputedStyle(el).maskImage)).toContain('gradient');
    await box.fill('');
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

const STEP_FIXTURE = path.resolve('verify', 'fixtures', 'cadimport', 'two-bodies-inch.step');

const cadModule = (...parts: string[]) => import(pathToFileURL(path.resolve('electron', 'cadImport', ...parts)).href);

async function convertInNodeHost(name: string, base64: string) {
  const [{ createNodeConverter }, { openCadFile }] = await Promise.all([
    cadModule('nodeHost', 'client.mjs'),
    cadModule('openCadFile.mjs'),
  ]);
  const opened = await openCadFile(createNodeConverter(), {
    name,
    bytes: new Uint8Array(Buffer.from(base64, 'base64')),
  });

  return { bodies: opened.bodies, data: Buffer.from(opened.data).toString('base64') };
}

function dropFile(page: App['page'], name: string, base64: string) {
  return page.evaluate(
    ({ name, base64 }) => {
      const transfer = new DataTransfer();
      const target = [...document.querySelectorAll('.canvas-cursor canvas')].find((c) => !c.closest('[inert]'))!;
      const { x, y, width, height } = target.getBoundingClientRect();
      const at = { clientX: x + width / 2, clientY: y + height / 2 };

      transfer.items.add(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name));

      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, ...at }));
    },
    { name, base64 },
  );
}

describe('studio import', () => {
  it('opens a two-body STEP dropped on the canvas as two parts in one group', async () => {
    const summaries = () =>
      app.page.evaluate(() =>
        (
          window as unknown as { __studio: { parts: () => Array<{ name: string; kind: string; group?: string }> } }
        ).__studio.parts(),
      );

    await app.page.route('**/api/bridge/cad-open', async (route) => {
      const { name, data } = route.request().postDataJSON() as { name: string; data: string };

      await route.fulfill({ json: await convertInNodeHost(name, data) });
    });
    await dropFile(app.page, 'two-bodies-inch.step', fs.readFileSync(STEP_FIXTURE).toString('base64'));

    const imported = async () => (await summaries()).filter((p) => p.group === 'two-bodies-inch');

    await expect.poll(async () => (await imported()).length, { timeout: 60000 }).toBe(2);
    expect((await imported()).map(({ name, kind }) => [name, kind])).toEqual([
      ['Base Plate', 'mesh'],
      ['Post', 'mesh'],
    ]);
    expect(app.errors).toEqual([]);
  });
});

interface PlacingStudio {
  load: (record: unknown) => void;
  sceneRecord: () => { parts: Array<{ position: number[] }> };
}

describe('placing parts', () => {
  it('centers a part on the origin from the context menu', async () => {
    const xz = () =>
      app.page.evaluate(() => {
        const [part] = (window as unknown as { __studio: PlacingStudio }).__studio.sceneRecord().parts;

        return [part.position[0], part.position[2]];
      });

    await app.page.evaluate((record) => (window as unknown as { __studio: PlacingStudio }).__studio.load(record), {
      name: 'Centering',
      parts: [box('bracket', [40, 10, 30], [20, 20, 20], 10)],
      project: DEFAULT_PROJECT,
    });
    await expect.poll(() => partCount(app.page)).toBe(1);
    await clickRail('Layers');
    await app.page.locator(visible('li'), { hasText: 'bracket' }).first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Center on Origin' }).click();

    await expect.poll(xz).toEqual([0, 0]);
  });
});
