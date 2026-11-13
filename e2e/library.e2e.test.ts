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

beforeAll(async () => {
  app = await openApp({ models: [bracket] });
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

  it('shows only Insert on a hovered tile', async () => {
    await tile().hover();

    await expect.poll(() => tile().getByRole('button', { name: 'Insert Bracket' }).isVisible()).toBe(true);
    expect(await tile().getByRole('button', { name: 'More' }).count()).toBe(0);
  });

  it('opens the model menu on right-click and inserts from it', async () => {
    const before = await partCount(app.page);

    await tile().click({ button: 'right' });

    for (const name of ['Insert', 'Rename', 'Duplicate', 'Delete']) {
      await expect.poll(() => app.page.getByRole('menuitem', { name }).count()).toBeGreaterThan(0);
    }

    await app.page.getByRole('menuitem', { name: 'Insert' }).click();

    await expect.poll(() => partCount(app.page)).toBeGreaterThan(before);
    expect(app.errors).toEqual([]);
  });
});
