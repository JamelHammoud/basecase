import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { box } from '../src/sim/fixtures/parts';
import { shapeKey } from '../src/print/shapeKey';
import type { PrintRecord } from '../src/types/print';
import { openApp } from './harness';
import { openKitScene } from './kitScene';
import { retainSelfContactSceneFiles } from './selfContactScene';
import { create, motor, purchasing, rover } from './buildAllocationScene';
import { allocationQuantityBounds, allocationTextBounds, narrowBuildPanel } from './buildAllocationLayout';

it(
  'labels historical quantities and confirms retained material returns at minimum panel width',
  { retry: 0 },
  async () => {
    const app = await openApp();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'build-allocation-returns-'));
    const scene = rover();
    const tab = scene.parts.find((part) => part.id === 'mounting-tab')!;
    const other = { ...box('other-tab', [50, 80, 0], [20, 5, 20], 1), name: 'Other mounting tab' };
    const legacy: PrintRecord = {
      id: 'historical-plate',
      plate: 1,
      hash: 'historical-plate',
      material: 'PLA',
      printer: 'Fixture',
      sentAt: '2026-11-20T10:00:00Z',
      state: 'printed',
      parts: [tab, other].map((part) => ({ id: part.id, key: shapeKey(part) })),
    };

    try {
      savePurchase(directory, { key: motor, record: { onHand: 1 } });
      await purchasing(app.page, directory);
      await retainSelfContactSceneFiles(app.page);
      await openKitScene(app.page, {
        ...scene,
        parts: [...scene.parts, other],
        project: { ...scene.project, prints: [legacy] },
      });
      await narrowBuildPanel(app.page);
      await create(app.page, 'Returns');
      await app.page.getByRole('button', { name: 'Returns', exact: true }).click();

      const component = app.page.locator(`[data-allocation-key="${motor}"]`);
      const printed = app.page.locator('[data-allocation-part="mounting-tab"]');

      await component.getByRole('textbox', { name: 'Quantity', exact: true }).focus();
      await app.page.keyboard.press('Tab');
      expect(
        await component
          .getByRole('button', { name: 'Reserve', exact: true })
          .evaluate((button) => button === document.activeElement),
      ).toBe(true);
      await app.page.keyboard.press('Enter');
      await expect.poll(() => listPurchases(directory)[motor].reservations?.[0].quantity).toBe(1);
      await printed.getByRole('button', { name: 'Reconcile Quantity', exact: true }).click();

      const dialog = app.page.getByRole('dialog', { name: 'Reconcile Quantity', exact: true });

      for (const [index, part] of [tab, other].entries()) {
        const input = dialog.getByRole('textbox', { name: part.name, exact: true });

        await input.fill(String(index + 1));
        await input.press('Tab');

        const bounds = await input.evaluate((element) => {
          const label = element.parentElement!.parentElement!.querySelector('span')!;
          const range = document.createRange();

          range.selectNodeContents(label);

          const text = range.getBoundingClientRect();
          const field = element.getBoundingClientRect();

          return { labelLeft: text.left, labelRight: text.right, labelBottom: text.bottom, ...field.toJSON() };
        });

        expect(bounds.labelLeft).toBeGreaterThanOrEqual(bounds.left);
        expect(bounds.labelRight).toBeLessThanOrEqual(bounds.right);
        expect(bounds.labelBottom).toBeLessThanOrEqual(bounds.top);
        expect(bounds.height).toBe(32);
      }

      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect
        .poll(() => listPurchases(directory)['print:historical-plate']?.printOutput?.record.copies?.length)
        .toBe(3);
      await printed.getByRole('button', { name: 'Assign Copy', exact: true }).click();
      await expect.poll(() => printed.textContent()).toContain('Assigned 1/');
      await app.page.getByRole('button', { name: 'Done', exact: true }).click();
      await app.page.getByRole('button', { name: 'Returns', exact: true }).hover();
      await app.page
        .getByRole('button', { name: 'Returns', exact: true })
        .locator('..')
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await app.page
        .getByRole('dialog', { name: 'Delete Returns?', exact: true })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();

      const retained = app.page
        .locator('section')
        .filter({ has: app.page.getByRole('heading', { name: 'Retained allocations', exact: true }) })
        .last();

      await allocationTextBounds(retained.locator('.break-all'));
      await allocationQuantityBounds(component);
      await component.getByRole('button', { name: 'Return', exact: true }).click();
      await app.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(listPurchases(directory)[motor].reservations![0].quantity).toBe(1);
      await component.getByRole('button', { name: 'Return', exact: true }).click();
      await app.page.getByRole('dialog').getByRole('button', { name: 'Return', exact: true }).click();
      await expect.poll(() => listPurchases(directory)[motor].reservations![0].quantity).toBe(0);
      await expect.poll(() => retained.getByRole('button', { name: 'Return', exact: true }).count()).toBe(1);
      await retained.getByRole('button', { name: 'Return', exact: true }).click();
      await app.page.getByRole('dialog').getByRole('button', { name: 'Return', exact: true }).click();
      await expect
        .poll(() =>
          Object.values(listPurchases(directory)['print:historical-plate'].printOutput!.assignments)
            .flat()
            .every((owner) => !!owner.returnedAt),
        )
        .toBe(true);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
