import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { supportCommand } from './sketchSupport.helpers';
import { toleranceFixture } from '../src/utils/designParameters/tolerances.fixtures';
import { DEFAULT_PROJECT } from '../src/types/robotics';

let app: App;

beforeAll(async () => {
  app = await openApp();
});
afterAll(async () => {
  await app?.close();
});

it('authors spacer deviations and a failing stack, edits a dimension and undoes the result', async () => {
  const design = toleranceFixture();
  const parameters = design.parameters.map(({ name, unit, value }) => ({ name, unit, value }));

  await app.page.evaluate(
    (input) => {
      (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load(input);
    },
    { parts: design.parts, project: { ...DEFAULT_PROJECT, designParameters: parameters }, name: 'Spacer assembly' },
  );
  await supportCommand(app.page, 'Edit Parameters');

  const editor = app.page.locator(shown('[data-parameters]'));

  for (const [name, lower, upper] of [
    ['outer', '-0.1', '0.2'],
    ['inner', '-0.05', '0.25'],
  ]) {
    await editor.getByRole('textbox', { name: `Lower deviation for ${name}`, exact: true }).fill(lower);
    await editor.getByRole('textbox', { name: `Upper deviation for ${name}`, exact: true }).fill(upper);
    await editor.getByRole('textbox', { name: `Upper deviation for ${name}`, exact: true }).press('Enter');
    await expect
      .poll(() => editor.getByRole('textbox', { name: `Upper deviation for ${name}`, exact: true }).inputValue())
      .toBe(upper);
  }

  await editor.getByRole('button', { name: 'Dimensional tolerances', exact: true }).click();

  const requirement = editor.locator('[data-dimensional-requirement]');

  await requirement.getByRole('textbox', { name: 'Name', exact: true }).fill('clearance');
  await requirement.getByRole('textbox', { name: 'Expression', exact: true }).fill('outer - inner');
  await requirement.getByRole('textbox', { name: 'Minimum', exact: true }).fill('0');
  await requirement.getByRole('textbox', { name: 'Maximum', exact: true }).fill('1');
  await requirement.getByRole('switch').nth(0).click();
  await requirement.getByRole('switch').nth(1).click();
  await requirement.getByRole('button', { name: 'Add', exact: true }).click();
  await supportCommand(app.page, 'Show Build');

  const check = app.page.locator(shown('[data-check="Dimensional tolerances"]'));

  await expect.poll(() => check.getAttribute('data-status')).toBe('fail');
  await check.getByText('Dimensional tolerances', { exact: true }).click();
  await app.page.getByRole('button', { name: 'Edit Parameters', exact: true }).click();

  const inner = editor.getByRole('textbox', { name: 'inner', exact: true });

  await inner.fill('29.8');
  await inner.press('Enter');
  await supportCommand(app.page, 'Show Build');
  await expect.poll(() => check.getAttribute('data-status')).toBe('pass');
  await app.page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => check.getAttribute('data-status')).toBe('fail');
  expect(app.errors).toEqual([]);
});
