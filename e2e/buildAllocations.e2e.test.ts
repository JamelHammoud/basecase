import fs from 'node:fs';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { buildAllocationApps } from './buildAllocationApps';
import { openKitScene } from './kitScene';
import { retainSelfContactSceneFiles } from './selfContactScene';
import type { Purchases } from '../src/types/robotics';
import { motor, purchasing, create, rover } from './buildAllocationScene';
import { allocationCopyBounds, allocationQuantityBounds, narrowBuildPanel } from './buildAllocationLayout';

it('allocates a rover motor and two printed copies to independent builds through reload', { retry: 0 }, async () => {
  const group = buildAllocationApps(1);
  const { directory } = group;

  onTestFinished(group.close);

  try {
    const [app] = await group.ready;

    savePurchase(directory, { key: motor, record: { onHand: 1 } });
    await purchasing(app.page, directory);
    await retainSelfContactSceneFiles(app.page);
    await openKitScene(app.page, rover());
    await narrowBuildPanel(app.page);
    await create(app.page, 'Rover', 2);
    await app.page.getByRole('button', { name: 'Rover 1', exact: true }).click();

    const component = app.page.locator(`[data-allocation-key="${motor}"]`);

    await allocationQuantityBounds(component);
    await component.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect.poll(() => component.textContent()).toContain('Assigned 1/');
    await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Rover 2', exact: true }).click();
    await component.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect
      .poll(() => app.page.getByText('Unallocated stock doesn’t cover this quantity.', { exact: true }).count())
      .toBe(1);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.keyboard.press('ControlOrMeta+p');
    await app.page.getByRole('button', { name: 'Mark Printed', exact: true }).click();
    await expect
      .poll(() =>
        Object.values(listPurchases(directory)).some((entry) => entry.printOutput?.record.state === 'printed'),
      )
      .toBe(true);
    await app.page.keyboard.press('Escape');

    const output = Object.values(listPurchases(directory)).find(
      (entry) => entry.printOutput?.record.state === 'printed',
    )!.printOutput!;
    const two = output.record.parts.find(
      (part) => output.record.copies!.filter((copy) => copy.partId === part.id).length === 2,
    )!;

    expect(two).toBeDefined();

    const outputs = output.record.copies!.filter((copy) => copy.partId === two.id);

    for (const [index, name] of ['Rover 1', 'Rover 2'].entries()) {
      await app.page.getByRole('button', { name, exact: true }).click();

      const selector = app.page.locator(`[data-allocation-part="${two.id}"]`).getByRole('combobox');

      await expect.poll(() => selector.inputValue()).toBe(outputs[index].id);
      await allocationCopyBounds(selector);
      expect(await selector.locator('option').allTextContents()).toEqual(
        outputs
          .slice(index)
          .map((_, copy) =>
            expect.stringMatching(
              new RegExp(
                `^Plate ${output.record.plate}, copy ${index + copy + 1}, [A-Z][a-z]{2} \\d{1,2}(, \\d{4})?, \\d{1,2}:\\d{2} [AP]M$`,
              ),
            ),
          ),
      );

      if (index === 0) await selector.selectOption(outputs[index].id);

      await app.page
        .locator(`[data-allocation-part="${two.id}"]`)
        .getByRole('button', { name: 'Assign Copy', exact: true })
        .click();
      await expect
        .poll(() => app.page.locator(`[data-allocation-part="${two.id}"]`).textContent())
        .toContain('Assigned 1/');

      if (index === 0) await expect.poll(() => selector.inputValue()).toBe(outputs[1].id);

      await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    }

    await app.page.reload();
    await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await app.page.getByRole('tab', { name: /Build$/ }).click();
    await app.page.getByRole('button', { name: 'Rover 1', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).count()).toBe(1);
    await expect.poll(() => component.textContent()).toContain('Assigned 1/');
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Rover 2', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Complete Step', exact: true }).count()).toBe(1);
    await expect.poll(() => component.textContent()).toContain('Assigned 0/');

    const retained = JSON.parse(fs.readFileSync(path.join(directory, 'purchases.json'), 'utf8')) as Purchases;
    const owners = Object.values(retained)
      .flatMap((entry) => Object.values(entry.printOutput?.assignments ?? {}))
      .flat();

    const heldOutput = retained[`print:${output.record.id}`].printOutput!;
    const heldCopies = Object.entries(heldOutput.assignments).filter(([, history]) =>
      history.some((owner) => !owner.returnedAt),
    );
    const declared = new Map(heldOutput.record.copies!.map((copy) => [copy.id, copy]));

    expect(retained[motor].onHand).toBe(1);
    expect(retained[motor].reservations!.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(1);
    expect(retained[motor].reservations![0].demand.key).toBe(motor);
    expect(retained[motor].reservations![0].demand.identity?.manufacturer).toBe('Feetech');
    expect(retained[motor].reservations![0].demand.partIds.slice().sort()).toEqual(
      rover()
        .parts.filter((part) => part.componentId === 'feetech-sts3215' && part.componentVariant === 'c001')
        .map((part) => part.id)
        .sort(),
    );
    expect(new Set(owners.map((owner) => owner.build.id)).size).toBe(2);
    expect(heldCopies).toHaveLength(2);
    expect(
      heldCopies.every(
        ([copy, history]) =>
          history.filter((owner) => !owner.returnedAt).length === 1 && declared.get(copy)?.partId === two.id,
      ),
    ).toBe(true);
    expect(
      owners.every((owner) => owner.demand.partId === two.id && owner.demand.material === heldOutput.record.material),
    ).toBe(true);
    expect(heldCopies.every(([copy, history]) => history[0].demand.key === declared.get(copy)?.key)).toBe(true);
    expect([...declared.values()].filter((copy) => copy.partId === two.id)).toHaveLength(2);
    expect(app.errors).toEqual([expect.stringMatching(/status of 500.*\/api\/bridge\/purchase-save/)]);
  } finally {
    await group.close();
  }
});

it('accepts only one reservation for the final motor from independent browser contexts', { retry: 0 }, async () => {
  const group = buildAllocationApps(2);
  const { directory } = group;

  onTestFinished(group.close);

  try {
    const apps = await group.ready;

    savePurchase(directory, { key: motor, record: { onHand: 1 } });
    await Promise.all(
      apps.map(async (app, index) => {
        await purchasing(app.page, directory);
        await openKitScene(app.page, rover());
        await create(app.page, `Rover ${index + 1}`);
        await app.page.getByRole('button', { name: `Rover ${index + 1}`, exact: true }).click();
      }),
    );
    await Promise.all(
      apps.map((app) =>
        app.page
          .locator(`[data-allocation-key="${motor}"]`)
          .getByRole('button', { name: 'Reserve', exact: true })
          .click(),
      ),
    );
    await expect.poll(() => listPurchases(directory)[motor].reservations?.length ?? 0).toBe(1);
    await expect
      .poll(async () =>
        (
          await Promise.all(
            apps.map((app) =>
              app.page.getByText('Unallocated stock doesn’t cover this quantity.', { exact: true }).count(),
            ),
          )
        ).reduce((sum, count) => sum + count, 0),
      )
      .toBe(1);
    expect(listPurchases(directory)[motor].reservations![0].quantity).toBe(1);
  } finally {
    await group.close();
  }
});
