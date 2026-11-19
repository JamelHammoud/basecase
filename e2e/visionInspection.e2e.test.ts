import { afterEach, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { openVisionInspection } from './visionInspectionFlow';

let app: App;

afterEach(async () => {
  await app?.close();
});

it('switches candidate and incumbent overlays on a frozen comparison image', { retry: 0 }, async () => {
  app = await openApp();

  const dialog = await openVisionInspection(app);
  const overlay = dialog.getByRole('combobox', { name: 'Prediction overlay', exact: true });
  const predictions = dialog.locator('[data-prediction]');

  await expect.poll(() => predictions.count()).toBe(1);
  await overlay.selectOption('incumbent');
  await expect.poll(() => predictions.count()).toBe(0);
  await overlay.selectOption('candidate');
  await expect.poll(() => predictions.count()).toBe(1);
  expect(app.errors).toEqual([]);
});
