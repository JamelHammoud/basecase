import { readFile } from 'node:fs/promises';
import { expect, inject, it } from 'vitest';
import type { Page } from 'playwright-core';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { drawingRover } from '../src/sheet/drawing.fixtures';
import type { DrawingManifest } from '../src/sheet/drawingTypes';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openKitScene } from './kitScene';
import { encodeSceneFile } from '../src/utils/sceneFile';
import { openApp, shown } from './harness';
import { stubKitGuideWorker } from './kitGuideWorker';

async function downloadDrawings(page: Page, format: 'Drawings' | 'Kit') {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: format, exact: true }).click();

  const sheet = page.getByRole('dialog', { name: format, exact: true });

  await sheet.getByRole('combobox', { name: 'Frame', exact: true }).selectOption('part');
  await sheet.getByRole('combobox', { name: 'Front plane', exact: true }).selectOption('xy');
  await sheet.getByRole('combobox', { name: 'Scale', exact: true }).selectOption('0.5');

  const delivered = page.waitForEvent('download');

  await sheet.getByRole('button', { name: 'Export', exact: true }).click();

  const download = await delivered;

  expect(await download.failure()).toBeNull();

  return unzipSync(await readFile((await download.path())!));
}

it(
  'imports a rover, exports its plate through Drawings, edits it in the Inspector and reconciles Kit drawing identities',
  { retry: 0 },
  async () => {
    const app = await openApp();

    try {
      const scene = drawingRover();
      const bytes = await encodeSceneFile({ ...scene, globalGoal: '', annotations: [] });

      await stubKitGuideWorker(app.page);
      await openKitScene(app.page, { name: 'Blank', parts: [], project: DEFAULT_PROJECT }, inject('webUrl'));

      const chooser = app.page.waitForEvent('filechooser');

      await app.page.keyboard.press('ControlOrMeta+k');
      await app.page.keyboard.type('Open Scene File');
      await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Open Scene File' }).click();
      await (
        await chooser
      ).setFiles({ name: 'workshop-rover.basecase', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
      await app.page.getByRole('tab', { name: 'Workshop rover', exact: true }).click();
      await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
      await app.page.locator(shown('[data-layer-row]')).filter({ hasText: 'Rover deck' }).click();

      const before = await downloadDrawings(app.page, 'Drawings');
      const first = JSON.parse(strFromU8(before['drawings.json'])) as DrawingManifest;
      const plate = first.sheets[0];

      expect(first.source.name).toBe('Workshop rover');
      expect(first.source.id).toBeTruthy();
      expect(plate.extents).toEqual([80, 60, 3]);
      expect(plate.units).toBe('mm');
      expect(plate.scale).toBe(0.5);
      expect(plate.holes.map((hole) => hole.center)).toEqual(
        expect.arrayContaining([
          [10, 10],
          [70, 10],
          [10, 50],
          [30, 50],
        ]),
      );
      expect(strFromU8(before['drawings.pdf'])).toContain('%PDF-1.4');
      await app.page
        .locator(shown('[role=tab]'))
        .filter({ hasText: /^Inspect$/ })
        .first()
        .click();

      const width = app.page.getByRole('textbox', { name: 'Width (X)', exact: true });

      await width.fill('100');
      await width.press('Enter');

      const after = await downloadDrawings(app.page, 'Drawings');
      const second = JSON.parse(strFromU8(after['drawings.json'])) as DrawingManifest;

      expect(second.sheets[0].extents[0]).toBe(100);
      expect(second.sheets[0].geometryFingerprint).not.toBe(plate.geometryFingerprint);
      expect(second.source.fingerprint).not.toBe(first.source.fingerprint);

      const kit = await downloadDrawings(app.page, 'Kit');
      const combined = JSON.parse(strFromU8(kit['drawings/drawings.json'])) as DrawingManifest;

      expect(combined.source).toEqual(second.source);

      const matching = combined.sheets.find((sheet) => sheet.partIds.includes(plate.partIds[0]))!;

      expect(matching).toEqual(second.sheets[0]);
      expect(kit[`drawings/${matching.svg}`]).toEqual(after[second.sheets[0].svg]);
      expect(matching.quantity).toBe(1);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
