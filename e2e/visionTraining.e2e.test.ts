import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/datasets/datasetFile';
import type { TrainingRun } from '../src/vision/training/serviceTypes';
import { openApp, shown, type App } from './harness';
import { visionTrainingRun } from './visionTrainingFixture';
import { tinyDetectionOnnx } from '../src/vision/onnxFixture';

interface TrainingStudio {
  seedVisionTrainingDataset: (mixed: boolean) => Promise<Dataset>;
  configureVisionTraining: (input: { runs: TrainingRun[]; hold: boolean }) => void;
  releaseVisionTraining: () => void;
  configureVisionBackend: (input: { baseline: number[]; candidate: number[] }) => Promise<void>;
  seedVisionBackendDataset: () => Promise<Dataset>;
  visionBackendState: () => Promise<{
    runs: TrainingRun[];
    dataset: Dataset;
    bindings: { modelId: string; camera: string; node: string }[];
    assignments: { modelId: string; camera: string }[];
  }>;
  visionTraining: () => {
    busy: boolean;
    runs: TrainingRun[];
    requests: { kind: string }[];
    applied: { runId: string }[];
  };
}

let app: App;

beforeEach(async () => {
  app = await openApp();
}, 120000);
afterEach(async () => {
  await app?.close();
});

describe('vision training from a dataset', () => {
  it('freezes real image sources, compares ONNX models, saves the result and applies the retained model', async () => {
    const { page } = app;

    await page.evaluate(
      (input) => (window as unknown as { __studio: TrainingStudio }).__studio.configureVisionBackend(input),
      {
        baseline: [...tinyDetectionOnnx([0, 0, 1, 1, 0.01, 0])],
        candidate: [...tinyDetectionOnnx([0, 0, 1, 1, 0.9, 0])],
      },
    );
    await page.evaluate(() => (window as unknown as { __studio: TrainingStudio }).__studio.seedVisionBackendDataset());

    const pane = page.locator(shown('[data-testid="dataset-pane"]'));
    const state = () =>
      page.evaluate(() => (window as unknown as { __studio: TrainingStudio }).__studio.visionBackendState());

    await pane.waitFor();
    await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).fill('60000');
    await pane.getByRole('textbox', { name: 'Latency limit', exact: true }).press('Tab');
    await pane.getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(async () => (await state()).runs.length).toBe(1);

    const trained = await state();
    const run = trained.runs[0];

    expect(run.status).toBe('retained');
    expect(run.incumbentReport.metrics.primary).toBe(0);
    expect(run.report.metrics.primary).toBe(1);
    expect(run.report.metrics.perClass[0]).toMatchObject({
      support: 1,
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 0,
    });
    expect(run.report.snapshot.map((sample) => sample.split).sort()).toEqual(['test', 'train', 'validation']);
    expect(run.report.realTest).toHaveLength(1);
    expect(run.report.realTest[0].source).toBe('try:vision-source-test');
    expect(new Set(run.provenance.map((source) => source.root)).size).toBe(3);
    expect(trained.dataset.versions[0].snapshot?.images).toHaveLength(3);
    expect(run.report.metrics.inference.samples).toBe(1);
    expect(run.report.metrics.inference.modelBytes).toBe(tinyDetectionOnnx([0, 0, 1, 1, 0.9, 0]).length);
    expect(app.posts.some((post) => post.route === 'vision-training-save-run')).toBe(true);
    await pane.getByRole('combobox', { name: 'Apply model to', exact: true }).selectOption('scene:object-detection');
    await pane.getByRole('button', { name: 'Apply Model', exact: true }).click();
    await expect
      .poll(async () => (await state()).bindings.map(({ camera, node, modelId }) => ({ camera, node, modelId })))
      .toContainEqual({
        camera: 'scene',
        node: 'object-detection',
        modelId: run.manifest.id,
      });
    await expect
      .poll(async () => (await state()).assignments.map(({ camera, modelId }) => ({ camera, modelId })))
      .toContainEqual({ camera: 'scene', modelId: run.manifest.id });
    expect(app.errors).toEqual([]);
  });

  it.each([false, true])('trains and stops the existing image dataset action (mixed: %s)', async (mixed) => {
    const { page } = app;

    await page.evaluate(
      (runs) =>
        (window as unknown as { __studio: TrainingStudio }).__studio.configureVisionTraining({ runs, hold: true }),
      [visionTrainingRun(), visionTrainingRun(false)],
    );
    await page.evaluate(
      (hasTries) => (window as unknown as { __studio: TrainingStudio }).__studio.seedVisionTrainingDataset(hasTries),
      mixed,
    );

    const pane = page.locator(shown('[data-testid="dataset-pane"]'));
    const state = () =>
      page.evaluate(() => (window as unknown as { __studio: TrainingStudio }).__studio.visionTraining());

    await pane.waitFor();
    expect(await pane.getByRole('combobox', { name: 'Vision task' }).locator('option').allTextContents()).toEqual([
      'Detect Objects',
      'Segment Objects',
      'Find Keypoints',
      'Classify Images',
    ]);
    await pane.getByRole('combobox', { name: 'Vision task' }).selectOption('segment');
    await pane.getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(async () => (await state()).busy).toBe(true);
    await pane.getByRole('button', { name: 'Stop Training', exact: true }).click();
    await expect.poll(async () => (await state()).busy).toBe(false);
    expect((await state()).runs).toHaveLength(0);
    expect((await state()).requests[0].kind).toBe('segment');
    await pane.getByRole('combobox', { name: 'Vision task' }).selectOption('detect');
    await pane.getByRole('button', { name: 'Train', exact: true }).click();
    await page.evaluate(() => (window as unknown as { __studio: TrainingStudio }).__studio.releaseVisionTraining());
    await expect.poll(async () => (await state()).runs.length).toBe(1);
    await pane.getByRole('button', { name: 'Train', exact: true }).click();
    await page.evaluate(() => (window as unknown as { __studio: TrainingStudio }).__studio.releaseVisionTraining());
    await expect.poll(async () => (await state()).runs.length).toBe(2);

    const results = pane.getByTestId('vision-training-results');
    const text = await results.textContent();

    expect(text).toContain('85.0%');
    expect(text).toContain('55.0%');
    expect(text).toContain('75.0%');
    expect(text).toContain('2 misses');
    expect(text).toContain('1 false positive');
    expect(text).toContain('12.5 ms');
    expect(await results.getByRole('button', { name: 'Apply Model', exact: true }).count()).toBe(1);
    await results.getByRole('button', { name: 'Apply Model', exact: true }).click();
    await expect.poll(async () => (await state()).applied.map((item) => item.runId)).toEqual(['cup-improved']);
    expect(app.errors).toEqual([]);
  });
});
