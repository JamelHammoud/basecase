import { afterEach, beforeEach, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import {
  correctTwice,
  makeTeachingDataset,
  prepareTeaching,
  teachingLibrary,
  type TeachingStudio,
} from './teachingFixture';
import { hashOf } from '../src/skills/hash';
import { narrowBuildPanel } from './buildAllocationLayout';
import { narrowBodyMotionPanel } from './bodyMotionLayout';
import { expectPanelReadable } from './appearanceLayout';
import { expectOwnershipScrolling } from './teachingLayout';

let app: App;

beforeEach(async () => {
  app = await openApp({
    'train-status': { ready: true, engine: 'forge', uv: true, running: [] },
    'train-start': { jobId: null },
  });
}, 120000);

afterEach(async () => {
  await app?.close();
});

it(
  'takes over a saved arm policy twice and reopens one continuous try with its owners in Library',
  { retry: 0 },
  async () => {
    const { policy } = await prepareTeaching(app);

    await narrowBuildPanel(app.page);
    await narrowBodyMotionPanel(app.page);

    const id = await correctTwice(app);

    await teachingLibrary(app);
    await app.page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`)).click();

    const ownership = app.page.getByTestId('try-ownership');

    await expect.poll(() => ownership.isVisible()).toBe(true);
    expect(await ownership.locator('[data-owner="operator"]').count()).toBe(2);
    expect(await ownership.locator('[data-owner="policy"]').count()).toBe(3);
    expect(await ownership.getAttribute('data-policy')).toBe(hashOf(policy));
    await expectPanelReadable(ownership);
    await expectOwnershipScrolling(app, id);
    expect(app.errors).toEqual([]);
  },
);

it(
  'selects saved corrections in a dataset and sends a frozen compatible warm-start request',
  { retry: 0 },
  async () => {
    const { policy } = await prepareTeaching(app);

    await narrowBuildPanel(app.page);
    await narrowBodyMotionPanel(app.page);

    const id = await correctTwice(app, 'reset');

    await app.page.evaluate(async () => {
      const studio = (window as unknown as { __studio: TeachingStudio }).__studio;

      for (let i = 0; i < 4; i++) await studio.seedDatasetTry(`original-${i}`, i);
    });
    await makeTeachingDataset(app, id);

    await expect
      .poll(() =>
        app.page.getByTestId('dataset-pane').getByRole('button', { name: 'Train from Tries', exact: true }).isVisible(),
      )
      .toBe(true);
    await expectPanelReadable(app.page.getByTestId('dataset-pane'));
    await app.page
      .getByTestId('dataset-pane')
      .getByRole('button', { name: 'Train from Tries', exact: true })
      .press('Enter');
    await expect.poll(() => app.posts.filter((post) => post.route === 'train-start').length).toBe(1);

    const request = app.posts.find((post) => post.route === 'train-start')!.body as {
      job: {
        warmPolicy: unknown;
        teaching: { revision: string; mixture: { correctionRows: number; originalRows: number } };
      };
    };
    const dataset = await app.page.evaluate(
      () => (window as unknown as { __studio: TeachingStudio }).__studio.datasets()[0],
    );

    expect(request.job.warmPolicy).toEqual(policy);
    expect(request.job.teaching.revision).toBe(dataset.versions[0].hash);
    expect(request.job.teaching.mixture.correctionRows).toBeGreaterThan(0);
    expect(request.job.teaching.mixture.originalRows).toBeGreaterThan(0);
    expect(dataset.versions[0].snapshot!.samples.filter((sample) => sample.target === 'correction')).toHaveLength(2);
    expect(app.errors).toEqual([]);
  },
);
