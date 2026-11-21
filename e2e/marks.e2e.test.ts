import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings, type SceneMark } from '../src/types/robotics';
import { openApp, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: []; project: ProjectSettings }) => void;
  sceneRecord: () => { project: { marks?: SceneMark[] } };
  capture: (views: string[]) => Array<{ view: string; dataUrl: string }>;
}

const marks = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project.marks ?? []);

const canvasCenter = async () => {
  const box = (await app.page.locator('canvas:not([inert] *):visible').first().boundingBox())!;

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function draw(points: Array<[number, number]>) {
  const [first, ...rest] = points;

  await app.page.mouse.move(...first);
  await app.page.mouse.down();

  for (const p of rest) await app.page.mouse.move(...p, { steps: 2 });

  await app.page.mouse.up();
}

const focusedLabel = () => app.page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('annotate marks', () => {
  it('draws a mark and labels it', async () => {
    await app.page.keyboard.press('n');
    await app.page.getByRole('button', { name: 'Yellow' }).waitFor();

    const { x, y } = await canvasCenter();

    await draw([
      [x - 90, y],
      [x + 90, y],
    ]);
    expect(await marks()).toHaveLength(1);
    expect(await focusedLabel()).toBe('Mark label');

    await app.page.keyboard.type('Too thick');
    await app.page.keyboard.press('Enter');
    await expect.poll(async () => (await marks())[0]?.label).toBe('Too thick');
  });

  it('recolors the selected mark and records the view it was drawn from', async () => {
    await expect.poll(() => app.page.getByLabel('Mark label').count()).toBe(0);

    const { x, y } = await canvasCenter();

    await app.page.mouse.click(x + 90, y);
    await expect.poll(() => app.page.getByLabel('Mark label').inputValue()).toBe('Too thick');
    await app.page.getByRole('button', { name: 'Yellow' }).click();

    const [mark] = await marks();

    expect(mark.color).toBe('#facc15');
    expect(mark.view).toMatch(/^az:-?\d+,el:-?\d+$/);
  });

  it('shows the mark and its label in the renders the agent sees', async () => {
    const scratch = process.env.MARKS_SHOTS;
    const shots = await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.capture(['front']),
    );

    expect(shots).toHaveLength(1);

    if (!scratch) return;

    await app.page.screenshot({ path: `${scratch}/canvas.png` });
    writeFileSync(`${scratch}/look-front.png`, Buffer.from(shots[0].dataUrl.split(',')[1], 'base64'));
  });

  it('selects one mark by clicking it and deletes only that one', async () => {
    const { x, y } = await canvasCenter();

    await draw([
      [x - 200, y + 160],
      [x + 200, y + 160],
    ]);
    expect(await marks()).toHaveLength(2);
    expect(await focusedLabel()).toBe('Mark label');

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByLabel('Mark label').count()).toBe(0);
    await app.page.mouse.click(x, y + 160);
    await expect.poll(() => app.page.getByLabel('Mark label').count()).toBe(1);
    await app.page.keyboard.press('Backspace');
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await marks()).length).toBe(1);

    const left = await marks();

    expect(left).toHaveLength(1);
    expect(left[0].label).toBe('Too thick');
    expect(app.errors).toEqual([]);
  });

  it('moves a mark by dragging it', async () => {
    const { x, y } = await canvasCenter();
    const [before] = await marks();

    await draw([
      [x + 90, y],
      [x + 130, y],
      [x + 170, y],
    ]);

    const after = await marks();
    const meanX = (m: SceneMark) => m.points.reduce((sum, p) => sum + p[0], 0) / m.points.length;

    expect(after).toHaveLength(1);
    expect(after[0].label).toBe('Too thick');
    expect(meanX(after[0])).toBeGreaterThan(meanX(before) + 1);
    expect(app.errors).toEqual([]);
  });

  it('deletes every mark after asking, with Undo', async () => {
    const before: SceneMark[] = [0, 1].map((index) => ({
      id: `delete-mark-${index}`,
      points: [
        [-20, 10 + index * 20, 0],
        [20, 10 + index * 20, 0],
      ],
      partIds: [],
      color: '#facc15',
      label: `Mark ${index + 1}`,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));

    await app.page.clock.install();
    await app.page.reload();
    await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));
    await app.page.evaluate(
      (project) => (window as unknown as { __studio: Studio }).__studio.load({ parts: [], project }),
      { ...DEFAULT_PROJECT, marks: before },
    );
    await expect.poll(marks).toEqual(before);

    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Delete Marks');
    await app.page.keyboard.press('Enter');

    const dialog = app.page.getByRole('dialog');

    await expect.poll(() => dialog.getByText('Delete 2 marks?').count()).toBe(1);
    expect(await marks()).toEqual(before);
    await app.page.clock.pauseAt(await app.page.evaluate(() => Date.now() + 1000));

    try {
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect.poll(marks).toEqual([]);

      await app.page
        .getByRole('status')
        .filter({ hasText: 'Deleted 2 marks' })
        .getByRole('button', { name: 'Undo' })
        .click();
      await expect.poll(marks).toEqual(before);
      expect(app.errors).toEqual([]);
    } finally {
      await app.page.clock.resume();
    }
  });
});
