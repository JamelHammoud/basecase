import { parquetReadObjects } from 'hyparquet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { datasetFiles, inDataset, loadFixtureRobot } from './driveChecks';
import type { SimState, Studio } from './driveStudio';
import { openApp, openPlayTab, shown, type App } from './harness';

interface Segment {
  start: number;
  end: number;
  label: string;
}

type TriesStudio = Omit<Studio, 'simState'> & {
  simState: () => SimState & { timeline: { frame: number } | null };
  trySegments: () => { id: string | null; loaded: boolean; segments: Segment[] };
  tryLabels: (id: string) => Promise<{ tags?: string[]; segments?: Segment[] } | null>;
};

let app: App;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: TriesStudio }).__studio.simState());

const trySegments = () =>
  app.page.evaluate(() => (window as unknown as { __studio: TriesStudio }).__studio.trySegments());

const tryLabels = (id: string) =>
  app.page.evaluate((tryId) => (window as unknown as { __studio: TriesStudio }).__studio.tryLabels(tryId), id);

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

async function subtasks(): Promise<string[]> {
  const files = inDataset(await datasetFiles(app.page));
  const bytes = files['data/chunk-000/file-000.parquet'];
  const rows = await parquetReadObjects({ file: new Uint8Array(bytes).buffer });
  const notes = rows.flatMap((r) => (r.language_persistent ?? []) as Array<{ style: string; content: string }>);

  return [...new Set(notes.filter((n) => n.style === 'subtask').map((n) => n.content))];
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Try segments', () => {
  it('labels a Pick Up a Block try, splits a segment with S, tags the try and exports the subtasks', async () => {
    await loadFixtureRobot(app.page, 'arm-6dof');
    await openPlayTab(app.page, 'Cases');
    await button('New Case').click();

    const card = app.page.locator(shown('[data-testid="new-case"]'));

    await card.locator('[role=radio]', { hasText: 'Pick Up a Block' }).click();
    await card.locator('button', { hasText: 'Make Case' }).click();
    await expect.poll(async () => (await simState()).activeCase).toBe('pick-up-a-block');
    await app.page.evaluate(() => (window as unknown as { __studio: TriesStudio }).__studio.referenceTry());
    await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
    expect((await simState()).tries[0].passed).toBe(true);

    await app.page.getByTestId('try-row').first().locator('button[aria-label="Replay"]').click();
    await expect.poll(async () => (await trySegments()).loaded, { timeout: 30000 }).toBe(true);

    const opened = await trySegments();
    const labels = opened.segments.map((s) => s.label);

    expect(labels).toEqual(
      expect.arrayContaining(['grasp the block', 'lift the block', 'place the block', 'release the block']),
    );
    await expect.poll(() => app.page.getByTestId('segment-block').count()).toBe(opened.segments.length);

    const longest = opened.segments.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));

    await app.page.locator(`[data-testid="segment-block"][data-start="${longest.start}"]`).click();
    await expect.poll(async () => (await simState()).timeline?.frame).toBe(longest.start);

    for (let i = 0; i < 3; i++) await app.page.keyboard.press('ArrowRight');

    await expect.poll(async () => (await simState()).timeline?.frame).toBe(longest.start + 3);
    await app.page.keyboard.press('s');
    await expect.poll(async () => (await trySegments()).segments.length).toBe(opened.segments.length + 1);
    expect((await trySegments()).segments.map((s) => s.start)).toContain(longest.start + 3);
    await expect
      .poll(async () => (await tryLabels(opened.id!))?.segments?.length ?? 0)
      .toBe(opened.segments.length + 1);

    await app.page.locator(shown('[data-testid="try-row"]')).first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Tag', exact: true }).click();
    await app.page.getByRole('dialog').getByRole('textbox').fill('slow grasp');
    await app.page.keyboard.press('Enter');
    await expect.poll(async () => (await tryLabels(opened.id!))?.tags ?? []).toEqual(['slow grasp']);

    expect(await subtasks()).toEqual(expect.arrayContaining(['grasp the block', 'lift the block']));
    expect(app.errors).toEqual([]);
  });
});
