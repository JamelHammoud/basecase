import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CustomModelDefinition } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

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

const tile = () => app.page.locator(visible('[data-library-tile]'), { hasText: 'Bracket' }).first();

beforeAll(async () => {
  app = await openApp({ models: [bracket] });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('library tiles', () => {
  it('show only Insert on hover, with the name running the full width', async () => {
    await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await tile().hover();

    await expect.poll(() => tile().getByRole('button', { name: 'Insert Bracket' }).isVisible()).toBe(true);
    expect(await tile().getByRole('button', { name: 'More' }).count()).toBe(0);
  });

  it('open the model menu on right-click and insert from it', async () => {
    await tile().click({ button: 'right' });

    for (const name of ['Insert', 'Rename', 'Duplicate', 'Delete']) {
      await expect.poll(() => app.page.getByRole('menuitem', { name }).count()).toBeGreaterThan(0);
    }

    await app.page.getByRole('menuitem', { name: 'Insert' }).click();

    await expect.poll(() => partCount(app.page)).toBeGreaterThan(0);
    expect(app.errors).toEqual([]);
  });
});
