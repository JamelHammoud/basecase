import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { openApp } from './harness';
import { openKitScene } from './kitScene';
import { retainSelfContactSceneFiles } from './selfContactScene';
import { create, purchasing, motor } from './buildAllocationScene';
import { repairScene, selectedBuild, acceptRepairChecks } from './buildRepairScene';

it(
  'repairs only the selected build through removal, reload, replacement and explicit physical return',
  { retry: 0 },
  async () => {
    const app = await openApp();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'individual-build-repair-'));

    try {
      savePurchase(directory, { key: motor, record: { onHand: 2 } });
      await purchasing(app.page, directory);
      await retainSelfContactSceneFiles(app.page);
      await openKitScene(app.page, repairScene());
      await create(app.page, 'Arm', 2);
      await app.page.getByRole('button', { name: 'Arm 1', exact: true }).click();
      await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();

      await app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).waitFor();

      const source = await selectedBuild(app.page);

      await app.page
        .locator(`[data-allocation-key="${motor}"]`)
        .getByRole('button', { name: 'Reserve', exact: true })
        .click();
      await app.page.getByRole('button', { name: 'Done', exact: true }).click();
      await app.page.getByRole('button', { name: 'Arm 2', exact: true }).click();
      await app.page
        .locator(`[data-allocation-key="${motor}"]`)
        .getByRole('button', { name: 'Reserve', exact: true })
        .click();

      const second = await selectedBuild(app.page);

      await app.page.getByRole('button', { name: 'Done', exact: true }).click();
      await app.page.keyboard.press('ControlOrMeta+p');
      await app.page.getByRole('button', { name: 'Mark Printed', exact: true }).click();
      await expect
        .poll(() => Object.values(listPurchases(directory)).filter((item) => item.printOutput).length)
        .toBeGreaterThan(0);
      await app.page.keyboard.press('Escape');

      for (const name of ['Arm 1', 'Arm 2']) {
        await app.page.getByRole('button', { name, exact: true }).click();
        await app.page
          .locator('[data-allocation-part="service-plate"]')
          .getByRole('button', { name: 'Assign Copy', exact: true })
          .click();
        await app.page.getByRole('button', { name: 'Done', exact: true }).click();
      }

      const ownership = listPurchases(directory);

      await app.page.evaluate(() =>
        (window as unknown as { __studio: { select: (ids: string[]) => void } }).__studio.select(['service-plate']),
      );
      await app.page.getByRole('tab', { name: /Inspect$/ }).click();
      await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('31');
      await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
      await app.page.keyboard.press('ControlOrMeta+p');
      await app.page.getByRole('button', { name: 'Mark Printed', exact: true }).click();
      await app.page.keyboard.press('Escape');
      await acceptRepairChecks(app.page);
      await app.page.getByRole('button', { name: 'Arm 1', exact: true }).click();
      await app.page.getByRole('button', { name: 'Repair Build', exact: true }).click();
      await app.page
        .getByRole('dialog', { name: 'Repair Build', exact: true })
        .getByRole('button', { name: 'Compare', exact: true })
        .click();
      await expect.poll(() => app.page.locator('[data-repair-preview-target]').count()).toBe(1);

      const target = await app.page.locator('[data-repair-preview-target]').getAttribute('data-repair-preview-target');

      await app.page.getByRole('button', { name: 'Start Repair', exact: true }).click();
      await expect.poll(async () => (await selectedBuild(app.page)).repairs?.length).toBe(1);
      await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();
      await app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).waitFor();
      await app.page.reload();
      await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
      await app.page.getByRole('tab', { name: /Build$/ }).click();
      await app.page.getByRole('button', { name: 'Arm 1', exact: true }).click();
      await app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).waitFor();

      const resumed = await selectedBuild(app.page);
      const repair = resumed.repairs!.at(-1)!;

      expect(repair.source).toBe(source.kit);
      expect(repair.target).toBe(target);
      expect(repair.completed['0']).toBeTruthy();
      await app.page
        .locator('[data-repair-allocations] [data-allocation-part="service-plate"]')
        .getByRole('button', { name: 'Assign Copy', exact: true })
        .click();

      for (let step = 1; step < repair.count; step++) {
        await app.page.getByRole('button', { name: 'Next step', exact: true }).click();

        if (step === 1) {
          const downloading = app.page.waitForEvent('download');

          await app.page.getByRole('button', { name: 'Export 3MF', exact: true }).click();
          expect((await downloading).suggestedFilename()).toMatch(/\.3mf$/);
        }

        await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();
      }

      await app.page.getByRole('button', { name: 'Finish Repair', exact: true }).click();
      await expect.poll(async () => (await selectedBuild(app.page)).configuration).toBe(target);
      expect((await selectedBuild(app.page)).completed).toEqual(source.completed);

      const held = listPurchases(directory);
      const original = Object.entries(ownership).find(([, item]) =>
        item.printOutput?.record.copies?.some((copy) => copy.partId === 'service-plate'),
      )!;

      expect(held[original[0]].printOutput!.assignments).toEqual(original[1].printOutput!.assignments);
      await app.page
        .locator('[data-allocation-part="service-plate"]')
        .first()
        .getByRole('button', { name: /^Return Copy / })
        .click();
      await app.page.getByRole('dialog').getByRole('button', { name: 'Return', exact: true }).click();
      await expect
        .poll(
          () =>
            Object.values(listPurchases(directory)[original[0]].printOutput!.assignments)
              .flat()
              .filter((item) => item.returnedAt).length,
        )
        .toBe(1);
      await app.page.getByRole('button', { name: 'Done', exact: true }).click();
      await app.page.getByRole('button', { name: 'Arm 2', exact: true }).click();
      await app.page.locator(`[data-frozen-build="${second.id}"]`).waitFor();
      expect(await selectedBuild(app.page)).toEqual(second);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
