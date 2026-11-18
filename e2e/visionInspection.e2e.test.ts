import { afterEach, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { openVisionInspection, followVisionSource } from './visionInspectionFlow';

interface Tabs {
  list: () => { activeId: string };
  open: () => void;
  select: (id: string) => void;
}

let app: App;

afterEach(async () => {
  await app?.close();
});

it(
  'switches inspection overlays, opens source playback and label editing, and dismisses scoped inspection on scene switching',
  { retry: 0 },
  async () => {
    app = await openApp();

    const { page } = app;
    const { pane, dialog, before, saved } = await openVisionInspection(app);

    await dialog.getByRole('combobox', { name: 'Prediction overlay', exact: true }).selectOption('incumbent');
    expect(await dialog.locator('[data-prediction]').count()).toBe(0);
    await dialog.getByRole('combobox', { name: 'Prediction overlay', exact: true }).selectOption('candidate');
    expect(await dialog.locator('[data-prediction]').count()).toBe(1);
    expect(await dialog.textContent()).toContain(before.runs[0].report.modelHash);
    expect(await dialog.textContent()).toContain(before.runs[0].incumbentReport.modelHash);
    await followVisionSource(app);
    await page.keyboard.press('Escape');
    await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();
    await dialog.getByRole('button', { name: 'source-test', exact: true }).click();
    await dialog.getByRole('button', { name: 'Open Original Image', exact: true }).click();

    const editor = page.getByRole('dialog', { name: 'Frame labels', exact: true });

    await editor.getByRole('button', { name: 'Rename Class', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Class name', exact: true }).fill('mug');
    await editor.getByRole('textbox', { name: 'Class name', exact: true }).press('Enter');
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
    await expect
      .poll(async () => (await saved()).dataset.imageMembers?.[0].hash)
      .not.toBe(before.dataset.imageMembers?.[0].hash);
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByLabel('Search commands').fill('Inspect Images');
    await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'source-test', exact: true }).click();
    await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Open Original Image', exact: true }).click();
    await expect.poll(() => dialog.getByRole('status').textContent()).toBe('Original image is unavailable');

    const tab = await page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.list().activeId);

    await page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.open());
    await expect.poll(() => dialog.count()).toBe(0);
    await page.evaluate((id) => (window as unknown as { __studioTabs: Tabs }).__studioTabs.select(id), tab);
    await expect.poll(() => dialog.count()).toBe(0);

    const after = await saved();

    expect(after.runs[0]).toEqual(before.runs[0]);
    expect(after.dataset.versions).toEqual(before.dataset.versions);
    expect(app.errors).toEqual([]);
  },
);
