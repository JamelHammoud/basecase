import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustomModelDefinition } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

const bracket: CustomModelDefinition = {
  id: 'model-bracket',
  name: 'Bracket',
  description: '',
  createdAt: '2026-11-01T10:00:00.000Z',
  sourceType: 'scene-selection',
  defaultDimensions: { width: 40, height: 20, depth: 30 },
  defaultColor: '#8a8a8a',
  mechanicalTag: '',
  nodes: [
    {
      id: 'node-1',
      name: 'Plate',
      nodeType: 'primitive',
      primitiveKind: 'box',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 40, height: 20, depth: 30 },
      color: '#8a8a8a',
    },
  ],
};

const tile = () => app.page.locator(shown('[data-library-tile]'), { hasText: 'Bracket' }).first();

async function showLibrary() {
  const rail = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click();
}

beforeAll(async () => {
  app = await openApp({ models: [bracket] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Library', () => {
  it('opens each sidebar view from its Show command in ⌘K', async () => {
    for (const view of ['Library', 'Layers']) {
      await app.page.keyboard.press('Meta+k');
      await app.page.keyboard.type(`Show ${view}`);
      await app.page.locator(shown('button[data-idx="0"]'), { hasText: `Show ${view}` }).waitFor();
      await app.page.keyboard.press('Enter');

      const rail = app.page.locator(shown(`nav[aria-label="Sidebar views"] button[aria-label="${view}"]`));

      await expect.poll(() => rail.getAttribute('aria-pressed')).toBe('true');
    }

    expect(app.errors).toEqual([]);
  });

  it('saves the scene from the New Model menu in the view header', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    expect(await partCount(app.page)).toBe(1);

    await showLibrary();

    const header = app.page.locator(shown('aside div:has(> h2)'), { hasText: 'Library' });

    await header.getByRole('button', { name: 'New model' }).click();
    await app.page.getByRole('menuitem', { name: 'Save Whole Scene' }).click();

    await expect.poll(() => app.posts.some((p) => p.route === 'save-model')).toBe(true);
    expect(await app.page.locator(shown('aside')).getByText('Models', { exact: true }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('inserts a model once when its tile is clicked, with no controls on the tile', async () => {
    await showLibrary();

    const before = await partCount(app.page);

    expect(await tile().evaluate((el) => el.tagName)).toBe('BUTTON');
    expect(await tile().locator('button').count()).toBe(0);

    await tile().click();

    await expect.poll(() => partCount(app.page)).toBe(before + 1);
    expect(app.errors).toEqual([]);
  });

  it('opens the model menu on right-click and inserts from it', async () => {
    await showLibrary();

    const before = await partCount(app.page);

    await tile().click({ button: 'right' });

    for (const name of ['Insert', 'Rename', 'Duplicate', 'Delete']) {
      await expect.poll(() => app.page.getByRole('menuitem', { name }).count()).toBeGreaterThan(0);
    }

    await app.page.getByRole('menuitem', { name: 'Insert' }).click();

    await expect.poll(() => partCount(app.page)).toBeGreaterThan(before);
    expect(app.errors).toEqual([]);
  });

  it('renames, duplicates and deletes a model at once, without waiting for the Library to reload', async () => {
    await showLibrary();

    const library = app.page.locator(shown('aside'));
    const named = (name: string) => library.locator('[data-library-tile]', { hasText: name });
    const writes = () => app.posts.filter((p) => p.route === 'save-model' || p.route === 'delete-model').length;
    const reloads = () => app.requests.filter((url) => new URL(url).pathname === '/api/bridge/models').length;
    const before = { writes: writes(), reloads: reloads() };

    await tile().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Rename' }).click();

    const rename = library.getByLabel('Name', { exact: true });

    await rename.fill('Base plate');
    await rename.press('Enter');
    await named('Base plate').first().waitFor();

    await named('Base plate').first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await named('Base plate copy').waitFor();

    await named('Base plate copy').click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Delete' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    await expect.poll(() => named('Base plate copy').count()).toBe(0);
    expect(await named('Base plate').count()).toBe(1);
    expect({ writes: writes(), reloads: reloads() }).toEqual({ writes: before.writes + 3, reloads: before.reloads });
    expect(app.errors).toEqual([]);
  });
});
