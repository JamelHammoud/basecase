import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { encodeSceneFile, decodeSceneFile } from '../src/utils/sceneFile';
import { parameterRover } from '../src/utils/designParameters/assemblies.fixtures';
import { parameterKernel } from './designParameters.helpers';
import {
  pickSupportFile,
  supportCommand,
  supportDownload,
  supportParts,
  supportSceneStorage,
  supportTriangles,
} from './sketchSupport.helpers';

let app: App;
let kernel: Awaited<ReturnType<typeof parameterKernel>>;

beforeAll(async () => {
  app = await openApp();
  await supportSceneStorage(app.page);
  kernel = await parameterKernel(app.page);
});
afterAll(async () => {
  kernel?.close();
  await app?.close();
});

async function selectPart(name: string) {
  const layers = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]'));

  if ((await layers.getAttribute('aria-pressed')) !== 'true') await layers.click();

  await app.page.locator(shown('[data-layer-row]')).filter({ hasText: name }).click();
}

async function bind(target: string, expression: string) {
  const form = app.page.locator(shown('[data-dimension-bindings]'));

  await form.getByRole('combobox', { name: 'Dimension', exact: true }).selectOption(target);
  await form.getByRole('textbox', { name: 'Expression', exact: true }).fill(expression);
  await form.getByRole('button', { name: 'Bind', exact: true }).click();
  await expect
    .poll(async () =>
      (await supportParts(app.page))
        .flatMap((part) => part.dimensionBindings ?? [])
        .some((binding) => binding.expression === expression),
    )
    .toBe(true);
}

it(
  'imports a rover, binds Inspector dimensions, changes shared width, undoes, redoes and reopens the exported scene',
  { retry: 0 },
  async () => {
    const bytes = await encodeSceneFile(parameterRover());

    await pickSupportFile(app.page, { name: 'Shared rover.basecase', base64: Buffer.from(bytes).toString('base64') });
    await supportCommand(app.page, 'Import');
    await expect.poll(async () => (await supportParts(app.page)).some((part) => part.id === 'deck')).toBe(true);
    await supportCommand(app.page, 'Edit Parameters');

    const parameters = app.page.locator(shown('[data-parameters]'));

    await parameters.getByRole('textbox', { name: 'Name', exact: true }).fill('width');
    await parameters.getByRole('textbox', { name: 'Value', exact: true }).fill('160');
    await parameters.getByRole('button', { name: 'Add', exact: true }).click();
    await selectPart('Rover deck');
    await bind('cad:width', 'width');
    await selectPart('Mounting plate');
    await bind('cad:spacing', 'width - 40 mm');
    await bind('cad:width', 'width - 16 mm');

    const catalog = (await supportParts(app.page)).filter((part) => part.componentId || part.hardware);
    const width = parameters.getByRole('textbox', { name: 'width', exact: true });
    const compilationCount = kernel.codes.length;

    await width.fill('200');
    await width.press('Enter');
    await width.blur();
    await expect
      .poll(async () => (await supportParts(app.page)).find((part) => part.id === 'deck')?.dimensions.width)
      .toBe(200);
    await expect
      .poll(async () => (await supportParts(app.page)).find((part) => part.id === 'mount')?.dimensions.width)
      .toBe(184);
    expect(kernel.codes.length - compilationCount).toBe(2);

    for (const [id, expected] of [
      ['deck', 200],
      ['mount', 184],
    ] as const) {
      const xs = (await supportTriangles(app.page, id)).filter((_, index) => index % 3 === 0);

      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(expected, 3);
    }

    expect((await supportParts(app.page)).filter((part) => part.componentId || part.hardware)).toEqual(catalog);
    await app.page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await supportParts(app.page)).find((part) => part.id === 'deck')?.dimensions.width)
      .toBe(160);
    await app.page.keyboard.press('ControlOrMeta+Shift+z');
    await expect
      .poll(async () => (await supportParts(app.page)).find((part) => part.id === 'deck')?.dimensions.width)
      .toBe(200);
    await supportCommand(app.page, 'Export Scene');
    await expect.poll(() => supportDownload(app.page)).not.toBeNull();

    const file = (await supportDownload(app.page))!;
    const decoded = await decodeSceneFile(new Uint8Array(Buffer.from(file.base64, 'base64')));

    expect(decoded.project?.designParameters).toEqual([{ name: 'width', unit: 'mm', value: 200 }]);
    expect(decoded.parts.find((part) => part.id === 'mount')?.dimensionBindings).toHaveLength(2);
    await pickSupportFile(app.page, file);

    const tabs = await app.page.locator('[data-tab-close]').count();

    await supportCommand(app.page, 'Open Scene File');
    await expect.poll(() => app.page.locator('[data-tab-close]').count()).toBe(tabs + 1);
    await expect
      .poll(async () => (await supportParts(app.page)).find((part) => part.id === 'mount')?.dimensions.width)
      .toBe(184);
    expect(app.errors).toEqual([]);
  },
);
