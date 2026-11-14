import { parquetReadObjects } from 'hyparquet';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { inDataset, loadFixtureRobot, passedDatasetFiles } from './driveChecks';
import { openApp, openPlayTab, shown, type App } from './harness';

let app: App;

type Segment = { from: number; to: number; label: string };

type Studio = {
  simState: () => { activeCase: string | null; tries: Array<{ id: string }> };
  referenceTry: () => Promise<void>;
  tryLabels: () => { id: string | null; segments: Segment[] };
  storedTry: (id: string) => Promise<{ labels?: { tags: string[]; segments: Segment[] } } | null>;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const segmentLabels = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.tryLabels().segments.map((s) => s.label),
  );

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

const parquetRows = (bytes: Buffer) => parquetReadObjects({ file: new Uint8Array(bytes).buffer });

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

itUnlessWindows(
  'splits a pick-and-place try into labelled segments, splits one with S, tags it and exports the subtasks',
  async () => {
    await loadFixtureRobot(app.page, 'arm-6dof');
    await openPlayTab(app.page, 'Cases');
    await button('New Case').click();

    const card = app.page.locator(shown('[data-testid="new-case"]'));

    await card.locator('[role=radio]', { hasText: 'Pick Up a Block' }).click();
    await card.locator('button', { hasText: 'Make Case' }).click();
    await expect.poll(async () => (await simState()).activeCase).toBe('pick-up-a-block');
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
    await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);

    const id = (await simState()).tries[0].id;
    const row = app.page.locator(shown('[data-testid="try-row"]')).first();

    await row.click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Tag…' }).click();
    await app.page.getByLabel('Tags').fill('red block, demo');
    await app.page.getByLabel('Tags').press('Enter');

    const stored = () =>
      app.page.evaluate((tryId) => (window as unknown as { __studio: Studio }).__studio.storedTry(tryId), id);

    await expect.poll(async () => (await stored())?.labels?.tags).toEqual(['red block', 'demo']);

    await row.click();
    await expect.poll(() => app.page.getByTestId('segment').count(), { timeout: 30000 }).toBeGreaterThan(2);

    const verbs = (await segmentLabels()).map((label) => label.split(' ')[0]);

    expect(verbs.filter((v) => ['reach', 'grasp', 'lift', 'release'].includes(v))).toEqual(
      expect.arrayContaining(['reach', 'grasp', 'lift', 'release']),
    );
    expect(verbs.indexOf('grasp')).toBeLessThan(verbs.lastIndexOf('lift'));
    expect((await segmentLabels()).find((label) => label.startsWith('grasp'))).toMatch(/^grasp \S/);

    const before = (await segmentLabels()).length;
    const first = app.page.getByTestId('segment').first();
    const box = (await first.boundingBox())!;

    await app.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await app.page.keyboard.press('s');
    await expect.poll(async () => (await segmentLabels()).length).toBe(before + 1);
    await expect.poll(async () => (await stored())?.labels?.segments.length).toBe(before + 1);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('try-timeline').count()).toBe(0);

    const files = inDataset(await passedDatasetFiles(app.page));
    const [frame] = (await parquetRows(files['data/chunk-000/file-000.parquet'])) as Array<{
      language_persistent: Array<{ role: string; style: string; content: string; timestamp: number }>;
    }>;
    const subtasks = frame.language_persistent.filter((r) => r.style === 'subtask');

    expect(subtasks).toHaveLength(before + 1);
    expect(subtasks[0]).toMatchObject({ role: 'assistant', timestamp: 0 });
    expect(subtasks.map((r) => r.content)).toEqual(expect.arrayContaining([expect.stringMatching(/^grasp /)]));
    expect(app.errors).toEqual([]);
  },
  180000,
);
