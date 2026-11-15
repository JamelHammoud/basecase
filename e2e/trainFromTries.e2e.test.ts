import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/datasets/datasetFile';
import { loadFixtureRobot } from './driveChecks';
import { openApp, openPlayTab, shown, type App } from './harness';

let app: App;

type Studio = {
  seedDatasetTry: (id: string, variant: number) => Promise<void>;
  datasets: () => Dataset[];
  simState: () => { activeCase: string | null };
};

type TrainingRequest = {
  xml: string;
  job: { algo: string; demos: { episodes: Array<{ split: string; obs: number[][]; actions: number[][] }> } };
};

const datasets = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.datasets());

const requests = () => app.posts.filter((post) => post.route === 'train-start');

async function runCommand(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.getByLabel('Search commands').fill(label);
  await app.page.locator(shown('button[data-idx]')).filter({ hasText: label }).first().click();
}

beforeEach(async () => {
  app = await openApp({
    'train-status': { uv: true, ready: true, running: [] },
    'train-start': { jobId: null },
  });
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Train from Tries', () => {
  it('starts the dataset job from its button and command, freezes it once and recovers when training stops', async () => {
    await loadFixtureRobot(app.page, 'arm-3dof');
    await openPlayTab(app.page, 'Cases');
    await app.page.getByRole('button', { name: 'New Case', exact: true }).click();
    await app.page.getByTestId('new-case').getByRole('button', { name: 'Make Case', exact: true }).click();
    await expect
      .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().activeCase))
      .toMatch(/^touch-a-point/);
    await app.page.evaluate(async () => {
      for (let i = 0; i < 5; i++)
        await (window as unknown as { __studio: Studio }).__studio.seedDatasetTry(`training-${i}`, i);
    });
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
    await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(5);
    await runCommand('Make Dataset');

    const pane = app.page.getByTestId('dataset-pane');
    const train = pane.getByRole('button', { name: 'Train from Tries', exact: true });

    await train.click();
    await expect.poll(() => requests().length).toBe(1);
    await expect
      .poll(() => app.page.getByRole('status').filter({ hasText: 'A newer design replaced this run.' }).count())
      .toBe(1);
    await expect.poll(() => train.isEnabled()).toBe(true);

    const first = requests()[0].body as TrainingRequest;
    const episodes = first.job.demos.episodes;

    expect(first.xml).toContain('<mujoco');
    expect(first.job.algo).toBe('bc');
    expect(episodes).toHaveLength(5);
    expect(episodes.map((episode) => episode.split)).toContain('train');
    expect(episodes.map((episode) => episode.split)).toContain('validation');
    expect(episodes.every((episode) => episode.obs.length > 0 && episode.actions.length === episode.obs.length)).toBe(
      true,
    );
    expect((await datasets())[0].versions).toHaveLength(1);
    await runCommand('Train from Tries');
    await expect.poll(() => requests().length).toBe(2);
    await expect.poll(() => train.isEnabled()).toBe(true);
    expect((requests()[1].body as TrainingRequest).job.demos).toEqual(first.job.demos);
    expect((await datasets())[0].versions).toHaveLength(1);
    expect(app.posts.filter((post) => post.route === 'skill-save')).toEqual([]);
    expect(app.errors).toEqual([]);
  });
});
