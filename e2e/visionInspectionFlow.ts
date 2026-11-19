import { loadFixtureRobot } from './driveChecks';
import { shown, type App } from './harness';
import { tinyDetectionOnnx } from '../src/vision/onnxFixture';
import type { TrainingRun } from '../src/vision/training/serviceTypes';

export interface InspectionStudio {
  configureVisionBackend: (input: { baseline: number[]; candidate: number[] }) => Promise<void>;
  prepareVisionInspection: (count?: number) => Promise<TrainingRun>;
}

export async function openVisionInspection(app: App) {
  const { page } = app;

  await loadFixtureRobot(page, 'arm-3dof');
  await page.evaluate(
    async (input) => {
      const studio = (window as unknown as { __studio: InspectionStudio }).__studio;

      await studio.configureVisionBackend(input);
      await studio.prepareVisionInspection();
    },
    {
      baseline: [...tinyDetectionOnnx([0, 0, 1, 1, 0.01, 0])],
      candidate: [...tinyDetectionOnnx([0, 0, 1, 1, 0.9, 0])],
    },
  );
  await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await page.locator(shown('[data-testid="library-datasets"]')).getByText('Real cups', { exact: true }).click();

  const pane = page.locator(shown('[data-testid="dataset-pane"]'));

  await pane.getByRole('button', { name: 'Inspect Images', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Comparison images', exact: true });

  await dialog.getByRole('combobox', { name: 'Class', exact: true }).selectOption('0');
  await dialog.getByRole('combobox', { name: 'Finding', exact: true }).selectOption('misses');
  await dialog.getByRole('button', { name: 'source-test', exact: true }).click();
  await dialog.getByRole('img', { name: 'Frozen comparison image', exact: true }).waitFor();

  return dialog;
}
