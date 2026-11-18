import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { box } from '../src/sim/fixtures/parts';
import { loadSupportScene, supportCommand, supportParts } from './sketchSupport.helpers';

let app: App;

beforeAll(async () => {
  app = await openApp();
});
afterAll(async () => {
  await app?.close();
});

async function bind(name: string, expression: string) {
  const layers = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]'));

  if ((await layers.getAttribute('aria-pressed')) !== 'true') await layers.click();

  await app.page.locator(shown('[data-layer-row]')).filter({ hasText: name }).click();

  const form = app.page.locator(shown('[data-dimension-bindings]'));

  await form.getByRole('combobox', { name: 'Dimension', exact: true }).selectOption('primitive:width');
  await form.getByRole('textbox', { name: 'Expression', exact: true }).fill(expression);
  await form.getByRole('button', { name: 'Bind', exact: true }).click();
  await expect
    .poll(async () =>
      (await supportParts(app.page))
        .find((part) => part.name === name)
        ?.dimensionBindings?.some((binding) => binding.expression === expression),
    )
    .toBe(true);
}

it('binds two Inspector dimensions and changes them through a shared parameter', { retry: 0 }, async () => {
  await loadSupportScene(app.page, [
    box('Deck', [0, 5, 0], [80, 10, 60], 100),
    box('Mount', [0, 20, 0], [64, 4, 20], 20),
  ]);
  await supportCommand(app.page, 'Edit Parameters');

  const parameters = app.page.locator(shown('[data-parameters]'));

  await parameters.getByRole('textbox', { name: 'Name', exact: true }).fill('width');
  await parameters.getByRole('textbox', { name: 'Value', exact: true }).fill('80');
  await parameters.getByRole('button', { name: 'Add', exact: true }).click();
  await bind('Deck', 'width');
  await bind('Mount', 'width - 16 mm');

  const width = parameters.getByRole('textbox', { name: 'width', exact: true });

  await width.fill('120');
  await width.press('Enter');
  await expect
    .poll(async () => (await supportParts(app.page)).map((part) => [part.id, part.dimensions.width]))
    .toEqual([
      ['Deck', 120],
      ['Mount', 104],
    ]);
  expect(app.errors).toEqual([]);
});
