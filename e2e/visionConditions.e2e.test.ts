import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { openApp, shown } from './harness';
import { tinyDetectionOnnx } from '../src/vision/onnxFixture';
import type { TrainingRun } from '../src/vision/training/serviceTypes';
import type { Dataset } from '../src/datasets/datasetFile';

interface ConditionStudio {
  visionConditionImport: () => Promise<Record<string, number[]>>;
  configureVisionBackend: (models: { baseline: number[]; candidate: number[] }) => Promise<void>;
  visionBackendState: () => Promise<{ runs: TrainingRun[]; dataset: Dataset }>;
}

it(
  'imports images, assigns conditions and inspects unchanged historical members after current edits',
  { retry: 0 },
  async () => {
    const app = await openApp();
    const root = mkdtempSync(join(tmpdir(), 'vision-conditions-'));
    const { page } = app;

    try {
      const files = await page.evaluate(async () =>
        (window as unknown as { __studio: ConditionStudio }).__studio.visionConditionImport(),
      );

      for (const [name, values] of Object.entries(files)) {
        const path = join(root, 'rover-conditions', name);

        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, new Uint8Array(values));
      }

      await page.keyboard.press('ControlOrMeta+k');
      await page.getByLabel('Search commands').fill('Import Robot');
      await page.keyboard.press('Enter');
      await page.locator('input[webkitdirectory]').setInputFiles(join(root, 'rover-conditions'));

      const library = page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

      if ((await library.getAttribute('aria-pressed')) !== 'true') await library.click();

      await page
        .locator(shown('[data-testid="library-datasets"]'))
        .getByText('Rover conditions', { exact: true })
        .click();

      const images = page.locator(shown('[data-testid="dataset-images"]'));
      const tile = images.getByTestId('dataset-image-tile').nth(2);
      const frameId = (await tile.getAttribute('data-frame'))!;
      const form = images.getByTestId('dataset-conditions');

      await tile.getByRole('button', { name: `Select image ${frameId}`, exact: true }).click();

      for (const condition of ['night', 'glare']) {
        await form.getByRole('textbox', { name: 'Condition', exact: true }).fill(condition);
        await form.getByRole('button', { name: 'Assign Condition', exact: true }).click();
        await expect.poll(() => tile.textContent()).toContain(condition);
      }

      await page.evaluate(
        async (models) => (window as unknown as { __studio: ConditionStudio }).__studio.configureVisionBackend(models),
        {
          candidate: [...tinyDetectionOnnx([0, 0, 1, 1, 0.9, 0])],
          baseline: [...tinyDetectionOnnx([0, 0, 1, 1, 0.01, 0])],
        },
      );

      const pane = page.locator(shown('[data-testid="dataset-pane"]'));
      const saved = () =>
        page.evaluate(() => (window as unknown as { __studio: ConditionStudio }).__studio.visionBackendState());

      await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).fill('60000');
      await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).press('Tab');
      await pane.getByRole('button', { name: 'Train', exact: true }).click();
      await expect.poll(async () => (await saved()).runs.length).toBe(1);

      const before = await saved();

      await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();

      const dialog = page.getByRole('dialog', { name: 'Comparison images', exact: true });
      const group = JSON.stringify({ kind: 'condition', name: 'night' });

      await dialog.getByRole('combobox', { name: 'Group', exact: true }).selectOption(group);
      await expect.poll(() => dialog.getByTestId('condition-results').textContent()).toContain('100.0%');

      const scores = dialog.getByTestId('condition-results');

      expect(
        await scores
          .locator('dt')
          .filter({ hasText: /^Box mAP$/ })
          .evaluate((node) => node.nextElementSibling?.textContent),
      ).toBe('100.0%');
      expect(
        await scores
          .locator('dt')
          .filter({ hasText: /^Incumbent$/ })
          .evaluate((node) => node.nextElementSibling?.textContent),
      ).toBe('0.0%');
      expect(
        await dialog
          .locator('dt')
          .filter({ hasText: /^Real test$/ })
          .evaluate((node) => node.nextElementSibling?.textContent),
      ).toBe('1');
      await dialog.getByRole('button', { name: frameId, exact: true }).click();
      await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await form.getByRole('textbox', { name: 'Condition', exact: true }).fill('night');
      await form.getByRole('button', { name: 'Remove Condition', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Delete night?', exact: true })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect.poll(() => tile.textContent()).not.toContain('night');
      await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Group', exact: true }).selectOption(group);
      await expect.poll(() => dialog.getByTestId('condition-results').textContent()).toContain('100.0%');
      await dialog.getByRole('button', { name: frameId, exact: true }).click();
      await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();
      expect((await saved()).runs).toEqual(before.runs);
      expect((await saved()).dataset.versions).toEqual(before.dataset.versions);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
