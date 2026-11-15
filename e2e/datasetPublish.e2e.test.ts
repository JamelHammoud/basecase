import { parquetReadObjects } from 'hyparquet';
import type { Dataset } from '../src/datasets/datasetFile';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { datasetFiles, inDataset, loadFixtureRobot } from './driveChecks';
import { openApp, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;
const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

type DatasetStudio = {
  seedDatasetTry: (id: string) => Promise<void>;
  datasetInstruction: (id: string, instruction: string) => Promise<void>;
  datasets: () => Dataset[];
};

type Row = Record<string, unknown>;

const tile = () => app.page.locator(visible('[data-testid="try-tile"]')).first();
const rows = (bytes: Buffer) => parquetReadObjects({ file: new Uint8Array(bytes).buffer }) as Promise<Row[]>;
const datasets = () => app.page.evaluate(() => (window as unknown as { __studio: DatasetStudio }).__studio.datasets());

async function makeSelectedDataset() {
  await tile().click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Make Dataset', exact: true }).click();
  await expect.poll(() => app.page.getByTestId('dataset-pane').count()).toBe(1);
}

describe('Dataset versions', () => {
  beforeEach(async () => {
    await loadFixtureRobot(app.page, 'arm-3dof');
    await app.page.evaluate(() =>
      (window as unknown as { __studio: DatasetStudio }).__studio.seedDatasetTry('freeze-try'),
    );
    await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await app.page.locator(visible('[data-testid="library-tries"] button')).first().click();
    await expect.poll(() => tile().count()).toBe(1);
  }, 120000);

  it('makes a dataset from the selected matching segment with the exact recorded frame range', async () => {
    await app.page.getByLabel('Search tries', { exact: true }).fill('lift block');
    await expect.poll(() => tile().count()).toBe(1);
    await makeSelectedDataset();

    const files = inDataset(await datasetFiles(app.page));
    const exported = await rows(files['data/chunk-000/file-000.parquet']);
    const sample = (await datasets())[0]?.versions[0]?.snapshot?.samples[0];

    expect(sample).toMatchObject({ tryId: 'freeze-try', from: 6, to: 12 });
    expect(exported).toHaveLength(3);
    expect(exported.map((r) => (r['observation.state'] as number[])[0])).toEqual([
      Math.fround(0.06),
      Math.fround(0.08),
      Math.fround(0.1),
    ]);
    await app.page.evaluate(() =>
      (window as unknown as { __studio: DatasetStudio }).__studio.datasetInstruction(
        'freeze-try',
        'Changed instruction',
      ),
    );
    await app.page.getByLabel('Dataset version', { exact: true }).selectOption('1');

    const older = inDataset(await datasetFiles(app.page));

    expect(Object.keys(older).sort()).toEqual(Object.keys(files).sort());

    for (const [path, bytes] of Object.entries(files)) expect(older[path], path).toEqual(bytes);

    expect((await datasets())[0].versions).toHaveLength(1);
    await app.page.getByLabel('Dataset version', { exact: true }).selectOption('working');
    expect(await button('Export Dataset').isEnabled()).toBe(true);
    expect(app.errors).toEqual([]);
  });

  it('exports two matching segments from one selected try as separate episodes', async () => {
    await app.page.getByLabel('Search tries', { exact: true }).fill('block');
    await expect.poll(() => tile().count()).toBe(1);
    await makeSelectedDataset();

    const files = inDataset(await datasetFiles(app.page));
    const exported = await rows(files['data/chunk-000/file-000.parquet']);
    const samples = (await datasets())[0].versions[0].snapshot!.samples;

    expect(samples.map(({ from, to }) => [from, to]).sort((a, b) => a[0] - b[0])).toEqual([
      [0, 6],
      [6, 12],
    ]);
    expect(JSON.parse(files['meta/info.json'].toString()).total_episodes).toBe(2);
    expect(exported).toHaveLength(6);

    for (const [episode, sample] of samples.entries()) {
      const frames = exported.filter((row) => Number(row.episode_index) === episode);
      const label = sample.from === 0 ? 'reach block' : 'lift block';

      expect(frames.map((row) => Number(row.frame_index))).toEqual([0, 1, 2]);
      expect(
        frames.map((row) => (row.language_persistent as Array<{ content: string }>).map((entry) => entry.content)),
      ).toEqual([[label], [label], [label]]);
    }

    expect(app.errors).toEqual([]);
  });
});
