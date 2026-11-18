import { afterAll, beforeAll, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { openApp, shown, type App } from './harness';
import { generatedFit } from '../src/print/fitVariants.fixtures';
import { fitBindings } from '../src/print/fitVariants';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { supportCommand, supportDownload, supportParts } from './sketchSupport.helpers';
import type { FitPlateIdentity } from '../src/print/fitVariantIdentity';

let app: App;

beforeAll(async () => {
  app = await openApp();
});
afterAll(async () => {
  await app?.close();
});

it(
  'prepares a bearing comparison through Print Fit Test, exports its real plate, applies a value and undoes it',
  { retry: 0 },
  async () => {
    const design = await generatedFit();

    await app.page.evaluate(
      (input) => {
        const studio = (window as unknown as { __studio: { load: (record: unknown) => void } }).__studio;

        studio.load({
          parts: input.parts,
          project: { ...input.project, designParameters: input.parameters },
          name: 'Bearing seat',
        });
      },
      { ...design, project: DEFAULT_PROJECT },
    );
    await expect.poll(async () => (await supportParts(app.page)).some((p) => p.id === 'host')).toBe(true);

    const checks = () =>
      app.page.evaluate(() =>
        (
          window as unknown as { __studio: { bodyChecks: () => Promise<{ fingerprint: string }> } }
        ).__studio.bodyChecks(),
      );

    await app.page.keyboard.press('ControlOrMeta+p');
    await app.page.getByRole('button', { name: 'Print Fit Test', exact: true }).click();
    await app.page
      .locator(shown('h2'))
      .filter({ hasText: /^Print Fit Test$/ })
      .waitFor();
    await app.page.getByRole('combobox', { name: 'Dimension', exact: true }).selectOption(fitBindings(design)[0].id);
    await app.page.getByRole('combobox', { name: 'Mating part', exact: true }).selectOption('mate');
    await app.page.getByRole('textbox', { name: 'Values (mm)', exact: true }).fill('21.9, 22, 22.1');
    await app.page.getByRole('button', { name: 'Prepare Variants', exact: true }).click();
    await app.page.getByRole('button', { name: '22.1 mm', exact: true }).waitFor();
    expect(await supportParts(app.page)).toEqual(design.parts);

    const beforeChecks = await checks();

    await supportCommand(app.page, 'Export 3MF Plates');
    await expect.poll(() => supportDownload(app.page)).not.toBeNull();

    const file = (await supportDownload(app.page))!;
    const entries = unzipSync(new Uint8Array(Buffer.from(file.base64, 'base64')));
    const map: FitPlateIdentity = JSON.parse(strFromU8(entries['Metadata/basecase-fit-test.json']));
    const model = strFromU8(entries['3D/3dmodel.model']);

    expect(file.name).toMatch(/\.3mf$/);
    expect(map.binding).toEqual(fitBindings(design)[0]);
    expect(map.candidates.map((c) => [c.value, c.objects.length, c.material])).toEqual([
      [21.9, 1, 'PETG'],
      [22, 1, 'PETG'],
      [22.1, 1, 'PETG'],
    ]);
    expect([...model.matchAll(/<object id=/g)]).toHaveLength(3);
    expect([...model.matchAll(/<triangle /g)].length).toBeGreaterThan(100);
    await app.page.getByRole('button', { name: '22.1 mm', exact: true }).click();
    await app.page.getByRole('button', { name: 'Apply 22.1 mm', exact: true }).click();

    const dimension = (parts: ScenePart[]) => parts[0].boolean!.operands.find((p) => p.id === 'bore')!.dimensions.width;

    await expect.poll(async () => dimension(await supportParts(app.page))).toBe(22.1);
    expect((await checks()).fingerprint).not.toBe(beforeChecks.fingerprint);
    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => dimension(await supportParts(app.page))).toBe(22);
    expect(app.errors).toEqual([]);
  },
);
