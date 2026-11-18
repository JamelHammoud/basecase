import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { openApp, shown } from './harness';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { TrainingRun } from '../src/vision/training/serviceTypes';
import type { Dataset } from '../src/datasets/datasetFile';

interface RequirementStudio {
  visionConditionImport: (requirements: boolean) => Promise<Record<string, number[]>>;
  configureVisionBackend: (models: { baseline: number[]; candidate: number[] }) => Promise<void>;
  visionBackendState: () => Promise<{ runs: TrainingRun[]; dataset: Dataset }>;
}

it('keeps an aggregate winner as a checkpoint and reopens its frozen operating requirement', { retry: 0 }, async () => {
  const app = await openApp();
  const root = mkdtempSync(join(tmpdir(), 'vision-requirements-'));
  const { page } = app;

  try {
    const files = await page.evaluate(async () =>
      (window as unknown as { __studio: RequirementStudio }).__studio.visionConditionImport(true),
    );

    for (const [name, values] of Object.entries(files)) {
      const path = join(root, 'rover-requirements', name);

      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, new Uint8Array(values));
    }

    await page.keyboard.press('ControlOrMeta+k');
    await page.getByLabel('Search commands').fill('Import Robot');
    await page.keyboard.press('Enter');
    await page.locator('input[webkitdirectory]').setInputFiles(join(root, 'rover-requirements'));

    const library = page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

    if ((await library.getAttribute('aria-pressed')) !== 'true') await library.click();

    await page
      .locator(shown('[data-testid="library-datasets"]'))
      .getByText('Rover conditions', { exact: true })
      .click();

    const images = page.locator(shown('[data-testid="dataset-images"]'));
    const tile = images.getByTestId('dataset-image-tile').nth(4);
    const frameId = (await tile.getAttribute('data-frame'))!;

    await tile.getByRole('button', { name: `Select image ${frameId}`, exact: true }).click();

    const form = images.getByTestId('dataset-conditions');

    await form.getByRole('textbox', { name: 'Condition', exact: true }).fill('night');
    await form.getByRole('button', { name: 'Assign Condition', exact: true }).click();
    await expect.poll(() => tile.textContent()).toContain('night');
    await page.evaluate(
      async (models) => (window as unknown as { __studio: RequirementStudio }).__studio.configureVisionBackend(models),
      {
        candidate: [...inputSensitiveDetectionOnnx([0, 0, 1, 1, 0.01, 0], [0, 0, 0, 0, 0.9, 0])],
        baseline: [...inputSensitiveDetectionOnnx([0, 0, 1, 1, 0.95, 0], [0, 0, 0, 0, -0.9, 0])],
      },
    );

    const pane = page.locator(shown('[data-testid="dataset-pane"]'));
    const group = JSON.stringify({ kind: 'condition', name: 'night' });

    await pane.getByRole('button', { name: 'Add Requirement', exact: true }).click();
    await pane
      .getByTestId('vision-requirement')
      .getByRole('combobox', { name: 'Group', exact: true })
      .selectOption(group);
    await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).fill('60000');
    await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).press('Tab');
    await pane.getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => pane.getByTestId('requirement-results').textContent()).toContain('Below score floor');

    const saved = () =>
      page.evaluate(() => (window as unknown as { __studio: RequirementStudio }).__studio.visionBackendState());
    const before = await saved();
    const run = before.runs[0];

    expect(run.report.metrics.primary!).toBeCloseTo(67 / 101, 10);
    expect(run.incumbentReport.metrics.primary!).toBeCloseTo(34 / 101, 10);
    expect(run.status).toBe('checkpoint');
    expect(run.comparison.requirements![0]).toMatchObject({ candidate: 0, incumbent: 1, support: 1, reason: 'floor' });
    expect(await pane.getByRole('button', { name: 'Apply Model', exact: true }).count()).toBe(0);
    await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Comparison images', exact: true });

    await dialog.getByRole('combobox', { name: 'Group', exact: true }).selectOption(group);
    await expect.poll(() => dialog.getByTestId('condition-results').textContent()).toContain('0.0%');
    await dialog.getByRole('button', { name: frameId, exact: true }).click();
    await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await form.getByRole('button', { name: 'Remove Condition', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete night?', exact: true })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect.poll(() => tile.textContent()).not.toContain('night');
    await pane.getByRole('textbox', { name: 'Score floor', exact: true }).fill('0');
    await pane.getByRole('textbox', { name: 'Score floor', exact: true }).press('Tab');
    await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Group', exact: true }).selectOption(group);
    await expect.poll(() => dialog.getByTestId('requirement-results').textContent()).toContain('Below score floor');
    await dialog.getByRole('button', { name: frameId, exact: true }).click();
    await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();
    expect((await saved()).runs).toEqual(before.runs);
    expect((await saved()).dataset.versions).toEqual(before.dataset.versions);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
