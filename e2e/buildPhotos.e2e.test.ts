import { expect, it } from 'vitest';
import sharp from 'sharp';
import type { Page } from 'playwright-core';
import { openApp } from './harness';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { openKitScene } from './kitScene';
import { retainSelfContactSceneFiles } from './selfContactScene';
import { narrowBuildPanel } from './buildAllocationLayout';
import { photoLayout, damageBuildPhoto } from './buildPhotoAssertions';

async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Make Build', exact: true }).click();
  await page.getByRole('textbox', { name: 'Build name', exact: true }).fill(name);
  await page
    .getByRole('dialog', { name: 'Make Build', exact: true })
    .getByRole('button', { name: 'Make', exact: true })
    .click();
  await expect.poll(() => page.getByRole('button', { name, exact: true }).count()).toBe(1);
}

async function importPhoto(page: Page) {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#669944' } })
    .png()
    .toBuffer();
  const chooser = page.waitForEvent('filechooser');

  await page.getByRole('button', { name: 'Import Photos', exact: true }).click();

  const selection = await chooser;

  await expect
    .poll(() => page.getByRole('button', { name: 'Import Photos', exact: true }).getAttribute('aria-busy'))
    .toBe('true');
  await photoLayout(page);
  await selection.setFiles({ name: 'bracket.png', mimeType: 'image/png', buffer });
  await expect.poll(() => page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(1);
  await expect.poll(() => page.locator('[data-build-photos] img').count()).toBe(1);
  await photoLayout(page);
}

it('imports a photograph beside frozen CAD and reopens only its original build and step', { retry: 0 }, async () => {
  const app = await openApp();

  try {
    await retainSelfContactSceneFiles(app.page);
    await openKitScene(app.page, kitArmScene());
    await app.page.setViewportSize({ width: 1240, height: 720 });
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();
    await narrowBuildPanel(app.page);
    await create(app.page, 'Photo arm one');
    await create(app.page, 'Photo arm two');
    await app.page.getByRole('button', { name: 'Photo arm one', exact: true }).click();
    await app.page.locator('[data-frozen-build]').waitFor({ state: 'visible' });
    expect(await app.page.getByRole('button', { name: 'Move', exact: true }).count()).toBe(0);
    await importPhoto(app.page);
    await app.page.getByRole('button', { name: 'bracket.png', exact: true }).focus();
    await app.page.keyboard.press('Enter');
    await expect.poll(() => app.page.locator('[data-build-photo-enlarged] img').count()).toBe(1);
    await photoLayout(app.page);
    await app.page.locator('[data-build-photo-enlarged]').getByRole('button', { name: 'Close', exact: true }).focus();
    await app.page.keyboard.press('Enter');
    expect(await app.page.locator('[data-build-photo-enlarged]').count()).toBe(0);
    expect(
      await app.page
        .getByRole('button', { name: 'bracket.png', exact: true })
        .evaluate((button) => button === document.activeElement),
    ).toBe(true);
    await app.page.keyboard.press('Enter');
    await expect.poll(() => app.page.locator('[data-build-photo-enlarged] img').count()).toBe(1);
    await app.page.keyboard.press('Escape');
    expect(await app.page.locator('[data-build-photo-enlarged]').count()).toBe(0);
    expect(await app.page.locator('[data-frozen-build]').count()).toBe(1);
    expect(
      await app.page
        .getByRole('button', { name: 'bracket.png', exact: true })
        .evaluate((button) => button === document.activeElement),
    ).toBe(true);
    expect(await app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(1);
    expect(await app.page.locator('[data-frozen-build] canvas').count()).toBeGreaterThan(0);
    await app.page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(0);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Move', exact: true }).count()).toBe(1);
    await app.page.reload();
    await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();
    await app.page.getByRole('button', { name: 'Photo arm two', exact: true }).click();
    expect(await app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(0);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Photo arm one', exact: true }).click();
    await app.page.getByRole('button', { name: 'Previous step', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(1);
    await app.page.getByRole('button', { name: 'bracket.png', exact: true }).click();
    await expect.poll(() => app.page.locator('[data-build-photo-enlarged] img').count()).toBe(1);
    expect(await app.page.locator('[data-frozen-build] canvas').count()).toBeGreaterThan(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

it('retains a photo through completion reversal and confirms individual deletion', { retry: 0 }, async () => {
  const app = await openApp();

  try {
    await retainSelfContactSceneFiles(app.page);
    await openKitScene(app.page, kitArmScene());
    await app.page.getByRole('tab', { name: 'Build', exact: true }).click();
    await create(app.page, 'Photo deletion');
    await app.page.getByRole('button', { name: 'Photo deletion', exact: true }).click();
    await importPhoto(app.page);
    await app.page.getByRole('button', { name: 'Complete Step', exact: true }).click();
    await expect.poll(() => app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).count()).toBe(1);
    await app.page.getByRole('button', { name: 'Mark Incomplete', exact: true }).click();
    await app.page.getByRole('button', { name: 'bracket.png', exact: true }).click();
    await app.page.locator('[data-build-photo-enlarged]').getByRole('button', { name: 'Delete', exact: true }).click();
    await app.page
      .getByRole('dialog', { name: 'Delete bracket.png?' })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    expect(await app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(1);
    await damageBuildPhoto(app.page);
    await app.page.getByRole('button', { name: 'Done', exact: true }).click();
    await app.page.getByRole('button', { name: 'Photo deletion', exact: true }).click();
    await app.page.locator('[data-frozen-build]').waitFor({ state: 'visible' });
    await expect.poll(() => app.page.locator('[data-build-photos] button').count()).toBe(1);
    await expect.poll(() => app.page.locator('[data-build-photos] .shimmer').count()).toBe(0);
    expect(await app.page.locator('[data-build-photos] img').count()).toBe(0);
    await app.page.getByRole('button', { name: 'bracket.png', exact: true }).click();
    await app.page.locator('[data-build-photo-enlarged]').getByRole('button', { name: 'Delete', exact: true }).click();
    await app.page
      .getByRole('dialog', { name: 'Delete bracket.png?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect.poll(() => app.page.getByRole('button', { name: 'bracket.png', exact: true }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
