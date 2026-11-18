import { expect } from 'vitest';
import { loadFixtureRobot } from './driveChecks';
import { shown, type App } from './harness';
import { tinyDetectionOnnx } from '../src/vision/onnxFixture';
import type { TrainingRun } from '../src/vision/training/serviceTypes';
import type { Dataset } from '../src/datasets/datasetFile';

export interface InspectionStudio {
  configureVisionBackend: (input: { baseline: number[]; candidate: number[] }) => Promise<void>;
  prepareVisionInspection: (count?: number) => Promise<TrainingRun>;
  simState: () => { timeline: { frame: number; open: boolean } };
  visionBackendState: () => Promise<{ runs: TrainingRun[]; dataset: Dataset }>;
}

export async function openVisionInspection(
  app: App,
  options: { count?: number; beforeInspect?: () => Promise<void> } = {},
) {
  const { page } = app;

  await loadFixtureRobot(page, 'arm-3dof');
  await page.evaluate(
    async (input) => {
      const studio = (window as unknown as { __studio: InspectionStudio }).__studio;

      await studio.configureVisionBackend(input);
      await studio.prepareVisionInspection(input.count);
    },
    {
      count: options.count ?? 1,
      baseline: [...tinyDetectionOnnx([0, 0, 1, 1, 0.01, 0])],
      candidate: [...tinyDetectionOnnx([0, 0, 1, 1, 0.9, 0])],
    },
  );
  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await page.locator(shown('[data-testid="library-datasets"]')).getByText('Real cups', { exact: true }).click();

  const pane = page.locator(shown('[data-testid="dataset-pane"]'));
  const saved = () =>
    page.evaluate(() => (window as unknown as { __studio: InspectionStudio }).__studio.visionBackendState());
  const before = await saved();

  await options.beforeInspect?.();
  await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Comparison images', exact: true });

  await dialog.getByRole('combobox', { name: 'Class', exact: true }).selectOption('0');
  await dialog.getByRole('combobox', { name: 'Finding', exact: true }).selectOption('misses');
  await dialog.getByRole('button', { name: 'source-test', exact: true }).click();
  await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();

  return { pane, dialog, before, saved };
}

export async function followVisionSource(app: App) {
  const dialog = app.page.getByRole('dialog', { name: 'Comparison images', exact: true });

  await dialog.getByRole('button', { name: 'Open Source Try', exact: true }).click();
  await expect
    .poll(() =>
      app.page.evaluate(() => (window as unknown as { __studio: InspectionStudio }).__studio.simState().timeline.frame),
    )
    .toBe(6);
}
