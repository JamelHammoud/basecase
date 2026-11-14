import { parquetReadObjects } from 'hyparquet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { loadFixtureRobot, passedDatasetFiles } from './driveChecks';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

type Segment = { from: number; to: number; label: string };

type Studio = {
  simState: () => { drive: string; activeCase: string | null; tries: Array<{ id: string }> };
  load: (r: unknown) => void;
  referenceTry: () => Promise<void>;
  tryLabels: () => { id: string | null; segments: Segment[] };
  storedTry: (id: string) => Promise<{ labels?: { tags: string[]; segments: Segment[] } } | null>;
};

type Tabs = { open: () => void; list: () => { ids: string[]; activeId: string } };

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const button = (name: string) => app.page.locator(shown('button'), { hasText: name }).first();

async function recordTry(): Promise<string> {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();

  const card = app.page.locator(shown('[data-testid="new-case"]'));

  await card.locator('button', { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).not.toBeNull();
  await button('Try It').click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down('w');
  await app.page.waitForTimeout(600);
  await app.page.keyboard.up('w');
  await button('Stop Try').click();
  await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

  return (await simState()).tries[0].id;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Tries in the Library', () => {
  itUnlessWindows('lists tries from two scenes, opens one on the timeline and deletes one', async () => {
    const first = await recordTry();

    await app.page.evaluate(() => (window as unknown as { __studioTabs: Tabs }).__studioTabs.open());
    await expect.poll(() => partCount(app.page)).toBe(0);

    const second = await recordTry();
    const rail = app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

    await rail.click();
    await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();

    const tile = (id: string) => app.page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`));

    await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(2);
    await expect.poll(() => tile(first).count()).toBe(1);

    await tile(second).click();
    await expect.poll(() => app.page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBeGreaterThan(0);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('try-timeline').count()).toBe(0);

    await tile(first).click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Delete' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(1);
    expect(await tile(second).count()).toBe(1);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('tries-mode').count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});

const segmentLabels = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.tryLabels().segments.map((s) => s.label),
  );

const parquetRows = (bytes: Buffer) => parquetReadObjects({ file: new Uint8Array(bytes).buffer });

describe('Labelling a try', () => {
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

      await row.getByRole('button', { name: 'Replay' }).click();
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

      const files = await passedDatasetFiles(app.page);
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
});
