import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

const panelTitle = (title: string) => app.page.locator(shown('h2'), { hasText: title });
const panelButton = (name: string) => app.page.locator(shown('button'), { hasText: new RegExp(`^${name}$`) });
const savedModels = () => app.posts.filter((p) => p.route === 'save-model');

async function openFromShapes(item: string) {
  await app.page.keyboard.press('a');
  await app.page.getByRole('menuitem', { name: item }).click();
}

async function addAndExpectPart(title: string) {
  const before = await partCount(app.page);

  expect(await panelButton('Add').count()).toBe(1);
  expect(await panelButton('Add & Save').count()).toBe(0);

  await panelButton('Add').click();

  await expect.poll(() => partCount(app.page)).toBe(before + 1);
  await expect.poll(() => panelTitle(title).count()).toBe(0);
  expect(savedModels()).toHaveLength(0);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Sketch and Import SVG add a part with one button', () => {
  it('adds the sketch outline as a part without saving it to the Library', async () => {
    await openFromShapes('Sketch');
    await expect.poll(() => panelTitle('Sketch').count()).toBe(1);

    await addAndExpectPart('Sketch');
  });

  it('adds an imported SVG as a part without saving it to the Library', async () => {
    await openFromShapes('Import SVG');
    await expect.poll(() => panelTitle('Import SVG').count()).toBe(1);
    await panelButton('4-Bolt Motor Mount Flange').click();

    await addAndExpectPart('Import SVG');
  });
});
