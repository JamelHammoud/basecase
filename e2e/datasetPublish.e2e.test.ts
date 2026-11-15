import { parquetReadObjects } from 'hyparquet';
import type { Dataset } from '../src/datasets/datasetFile';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import type { VisionManifest } from '../src/vision/manifest';
import { inputSensitiveDetectionOnnx } from '../src/vision/onnxFixture';
import type { SimState, Studio } from './driveStudio';
import { startFakeHub, type FakeHub } from './fakeHub';
import { datasetFiles, endTryAt, expectPublished, inDataset, loadFixtureRobot } from './driveChecks';
import { openApp, openPlayTab, type App } from './harness';
import { visionManifest } from './visionFixtures';

const HUB_TOKEN = 'hf_e2eFakeHubToken';
const SHORT_TRY_SECONDS = 0.4;

type PublishStudio = Studio & {
  configureVision: (manifest: VisionManifest, bytes: number[], cameras: string[]) => Promise<unknown>;
};

let app: App;
let hub: FakeHub;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const datasetPane = () => app.page.getByTestId('dataset-pane');

async function reopenDataset() {
  if (await datasetPane().count()) return;

  await app.page.locator(visible('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(visible('[data-testid="library-datasets"] button')).first().click();
  await expect.poll(() => datasetPane().count()).toBe(1);
}

async function passedTry() {
  await loadFixtureRobot(app.page, 'arm-3dof');
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();
  await app.page.locator(visible('[data-testid="new-case"] button'), { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toMatch(/^touch-a-point/);
  await button('Try It').click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await endTryAt(app.page, SHORT_TRY_SECONDS);
  await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.passTries());
}

beforeEach(async () => {
  hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  app = await openApp({}, ['hub-']);

  const bytes = inputSensitiveDetectionOnnx();

  await app.page.evaluate(
    ({ manifest, data }) =>
      (window as unknown as { __studio: PublishStudio }).__studio.configureVision(manifest, data, []),
    { manifest: visionManifest(bytes), data: [...bytes] },
  );
}, 120000);

afterEach(async () => {
  await app?.close();
  await hub?.close();
});

describe('Publish a dataset', () => {
  it.skipIf(process.platform === 'win32')(
    'publishes a dataset of a passed try to Hugging Face after signing in from Settings, tagged with its version',
    async () => {
      const publish = () => button('Publish to Hugging Face');
      const commitsOf = (name: string) => hub.repos.get(name)?.commits.length ?? 0;
      const ours = () => [...hub.repos.keys()].filter((name) => /^tester\/touch-a-point-[0-9a-f]{6}$/.test(name));
      const token = app.page.locator(visible('input[aria-label="Access token"]'));
      const toast = (text: RegExp) => app.page.getByRole('status').filter({ hasText: text });
      const outcome = toast(/Published to|Couldn’t publish|as it is now/);

      await passedTry();
      await expect.poll(() => button('Make Dataset').count()).toBe(1);
      expect(await publish().count()).toBe(0);
      await button('Make Dataset').click();
      await expect.poll(() => datasetPane().count()).toBe(1);
      await expect.poll(() => publish().count()).toBe(1);

      await publish().click();
      await token
        .or(toast(/Publishing dataset/))
        .or(outcome)
        .first()
        .waitFor({ timeout: 10000 });

      if (await token.isVisible()) {
        await token.fill(HUB_TOKEN);
        await token.press('Enter');
        await expect
          .poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings]')).innerText())
          .toContain('tester');
        await app.page.keyboard.press('Escape');
        await reopenDataset();
        await publish().dblclick();
      }

      await outcome.first().waitFor({ timeout: 120000 });

      const said = await outcome.first().innerText();
      const [repo] = ours();

      expect(said).toMatch(/^Published to /);
      expect(ours()).toHaveLength(1);
      expect(said).toContain(repo);
      expect(commitsOf(repo)).toBe(2);
      await expectPublished(hub, repo);
      await expect.poll(() => hub.repos.get(repo)!.tags.get('dataset-v1')).toBe(commitsOf(repo));
      expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain(HUB_TOKEN);
      expect(JSON.stringify(app.posts)).not.toContain(HUB_TOKEN);
      expect(app.requests.filter((url) => url.includes('/api/bridge/hub-model-file'))).toEqual([]);
      expect(app.errors).toEqual([]);
    },
    180000,
  );
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

  it('exports the chosen older version with its original labels and bytes after the working labels change', async () => {
    await makeSelectedDataset();

    const original = inDataset(await datasetFiles(app.page));

    await expect.poll(async () => (await datasets())[0]?.versions.length).toBe(1);
    expect((await rows(original['meta/tasks.parquet'])).map((r) => r.task)).toEqual(['Original instruction']);
    await app.page.evaluate(() =>
      (window as unknown as { __studio: DatasetStudio }).__studio.datasetInstruction(
        'freeze-try',
        'Changed instruction',
      ),
    );

    const changed = inDataset(await datasetFiles(app.page));

    await expect.poll(async () => (await datasets())[0]?.versions.length).toBe(2);
    expect((await rows(changed['meta/tasks.parquet'])).map((r) => r.task)).toEqual(['Changed instruction']);
    await app.page.getByLabel('Dataset version', { exact: true }).selectOption('1');

    const older = inDataset(await datasetFiles(app.page));

    expect(Object.keys(older).sort()).toEqual(Object.keys(original).sort());

    for (const [path, bytes] of Object.entries(original)) expect(older[path], path).toEqual(bytes);

    await expect.poll(async () => (await datasets())[0]?.versions.length).toBe(2);
    await app.page.getByLabel('Dataset version', { exact: true }).selectOption('working');
    expect(await button('Export Dataset').isEnabled()).toBe(true);
    expect(app.errors).toEqual([]);
  });

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
