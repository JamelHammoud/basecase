import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { box } from '../src/sim/fixtures/parts';
import type { BuildRecord } from '../src/kit/buildRecords';

export function repairScene() {
  const scene = kitArmScene();

  return {
    ...scene,
    name: 'Service arm',
    parts: [
      ...scene.parts,
      { ...box('service-plate', [200, 25, 0], [30, 4, 20], 10), name: 'Service plate', print: { copies: 2 } },
    ],
  };
}

export function selectedBuild(page: Page): Promise<BuildRecord> {
  return page.evaluate(
    () =>
      (window as unknown as { __studio: { frozenBuild: () => { record: BuildRecord } } }).__studio.frozenBuild().record,
  );
}

export async function acceptRepairChecks(page: Page) {
  await page.getByRole('tab', { name: /Build$/ }).click();
  await expect.poll(() => page.locator('[data-check]').count()).toBeGreaterThan(0);

  for (let count = 0; count < 16; count++) {
    if (await page.getByText('Ready to build', { exact: true }).count()) return;

    const check = page.locator('[data-check][data-status="fail"]').first();

    await check.getByRole('button').first().click();

    const finding = check.locator('[data-finding]').first();
    const key = await finding.getAttribute('data-finding');

    await finding.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Ignore All / }).click();
    await expect.poll(() => page.locator(`[data-finding="${key}"]`).count()).toBe(0);
  }

  expect(await page.getByText('Ready to build', { exact: true }).count()).toBe(1);
}

export async function resumeCanceledRepair(page: Page) {
  const before = await selectedBuild(page);
  const repair = before.repairs!.at(-1)!;

  await page.getByRole('button', { name: 'Cancel Repair', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel Repair', exact: true }).click();
  await expect.poll(async () => (await selectedBuild(page)).repairs!.at(-1)!.state).toBe('incomplete');
  expect(await page.getByRole('button', { name: 'Finish Repair', exact: true }).count()).toBe(0);
  expect(await page.getByRole('button', { name: 'Mark Incomplete', exact: true }).isDisabled()).toBe(true);
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect
    .poll(() => page.getByRole('toolbar', { name: 'Build Along', exact: true }).getAttribute('data-step'))
    .toBe('2');
  expect((await selectedBuild(page)).repairs!.at(-1)!.index).toBe(repair.index);
  expect(await page.getByRole('button', { name: 'Complete Step', exact: true }).isDisabled()).toBe(true);
  await page.getByRole('combobox', { name: 'Build history', exact: true }).selectOption('original');
  await expect.poll(() => page.getByRole('button', { name: 'Resume Repair', exact: true }).count()).toBe(0);
  await page.getByRole('combobox', { name: 'Build history', exact: true }).selectOption(repair.id);
  await page.getByRole('button', { name: 'Resume Repair', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await selectedBuild(page)).repairs!.at(-1)!.state).toBe('active');
  expect((await selectedBuild(page)).repairs!.at(-1)!.completed).toEqual(repair.completed);
}
