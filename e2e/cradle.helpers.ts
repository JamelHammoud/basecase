import fs from 'node:fs/promises';
import { expect } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { App } from './harness';
import { shown } from './harness';
import { stubKitGuideWorker } from './kitGuideWorker';
import { supportCommand, supportParts } from './sketchSupport.helpers';
import { box, joint } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';

interface CradleStudio {
  load: (record: unknown) => void;
  assemblyRobotWeight: () => Promise<string | null>;
  assemblyCradleState: () => { step: number; metrics: unknown };
}

export async function cradleStory(app: App, capture?: (state: string) => Promise<void>) {
  await stubKitGuideWorker(app.page);

  const base = {
    ...box('base', [0, 8, 0], [40, 16, 30], 50),
    name: 'Servo bracket',
    mechanicalTag: '3D Printed PLA/PETG',
  };
  const arm = box('arm', [0, 26, 0], [20, 20, 20], 20);
  const project = {
    ...DEFAULT_PROJECT,
    labelParts: false,
    joints: [joint({ id: 'hinge', link: ['base', 'arm'], origin: [0, 16, 0], axis: [0, 0, 1], effortNm: 1 })],
  };

  await app.page.evaluate((record) => (window as unknown as { __studio: CradleStudio }).__studio.load(record), {
    name: 'Assembly cradle',
    parts: [base, arm],
    project,
  });
  await expect.poll(() => supportParts(app.page)).toHaveLength(2);
  await app.page
    .locator(shown('[role=tab]'))
    .filter({ hasText: /^Build$/ })
    .first()
    .click();
  await app.page.getByRole('button', { name: 'Build Along', exact: true }).click();
  await app.page.getByRole('toolbar', { name: 'Build Along', exact: true }).waitFor();

  const parts = await supportParts(app.page);
  const weight = await app.page.evaluate(() =>
    (window as unknown as { __studio: CradleStudio }).__studio.assemblyRobotWeight(),
  );
  const before = await app.page.evaluate(() =>
    (window as unknown as { __studio: CradleStudio }).__studio.assemblyCradleState(),
  );

  expect(weight).toBeTruthy();
  await app.page.getByRole('button', { name: 'Make Assembly Cradle', exact: true }).click();

  const selection = app.page.getByRole('combobox', { name: 'Subassembly', exact: true });
  const selectedId = await selection.inputValue();
  const selectedPart = parts.find((part) => part.id === selectedId);

  expect(selectedPart).toBeDefined();
  await selection.selectOption(selectedId);
  await app.page.getByRole('combobox', { name: 'Resting face', exact: true }).selectOption('3');
  await capture?.('options');
  await app.page.getByRole('textbox', { name: 'Clearance', exact: true }).fill('0.5');
  await app.page.getByRole('textbox', { name: 'Clearance', exact: true }).press('Enter');
  await app.page
    .getByRole('dialog', { name: 'Assembly cradle', exact: true })
    .getByRole('button', { name: 'Make Assembly Cradle', exact: true })
    .click();
  await app.page
    .getByRole('dialog', { name: 'Assembly cradle', exact: true })
    .getByRole('button', { name: 'Print', exact: true })
    .waitFor();
  await capture?.('prepared');
  await app.page
    .getByRole('dialog', { name: 'Assembly cradle', exact: true })
    .getByRole('button', { name: 'Print', exact: true })
    .click();
  await app.page.locator('[data-plate-canvas] canvas').waitFor();
  await capture?.('print');

  const download = app.page.waitForEvent('download');

  await supportCommand(app.page, 'Export 3MF Plates');

  const file = await download;
  const archive = unzipSync(new Uint8Array(await fs.readFile((await file.path())!)));
  const identity = JSON.parse(strFromU8(archive['Metadata/basecase-assembly-cradle.json']));
  const model = strFromU8(archive['3D/3dmodel.model']);

  expect(identity.sourceIds).toEqual([selectedId]);
  expect(identity.clearanceMm).toBe(0.5);
  expect(identity.dimensionsMm[1]).toBeCloseTo(9, 4);
  expect(identity.dimensionsMm[0]).toBeGreaterThan(selectedPart!.dimensions.width + 5);
  expect(model).toContain('Assembly cradle');
  expect(model).not.toContain('Servo bracket');
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('toolbar', { name: 'Build Along', exact: true }).waitFor();
  await app.page.getByRole('button', { name: 'Show Removal', exact: true }).click();
  await capture?.('removal');
  expect(await supportParts(app.page)).toEqual(parts);
  expect(
    await app.page.evaluate(() => (window as unknown as { __studio: CradleStudio }).__studio.assemblyRobotWeight()),
  ).toBe(weight);
  expect(
    (await app.page.evaluate(() => (window as unknown as { __studio: CradleStudio }).__studio.assemblyCradleState()))
      .step,
  ).toBe(before.step);
  expect(app.errors).toEqual([]);
}
