import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SceneMark } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

interface Studio {
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

const circle = (cx: number, cy: number, r: number): Array<[number, number]> =>
  Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;

    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

const focusedLabel = () => app.page.evaluate(() => document.activeElement?.getAttribute('aria-label'));

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('annotate marks', () => {
  it('draws a mark and labels it', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().waitFor();
    await app.page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Cube'))?.click(),
    );
    await app.page.keyboard.press('Escape');
    await expect.poll(() => partCount(app.page)).toBe(1);
    await app.page.keyboard.press('n');
    await app.page.getByRole('button', { name: 'Yellow' }).waitFor();

    const { x, y } = await canvasCenter();

    await draw(circle(x, y, 90));
    expect(await marks()).toHaveLength(1);
    expect(await focusedLabel()).toBe('Mark label');

    await app.page.keyboard.type('Too thick');
    await app.page.keyboard.press('Enter');
    await expect.poll(async () => (await marks())[0]?.label).toBe('Too thick');
  });

  it('recolors the selected mark and records the view it was drawn from', async () => {
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
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByLabel('Mark label').count()).toBe(0);

    const { x, y } = await canvasCenter();

    await app.page.mouse.click(x + 90, y);
    await expect.poll(() => app.page.getByLabel('Mark label').inputValue()).toBe('Too thick');

    await draw([
      [x - 200, y + 160],
      [x + 200, y + 160],
    ]);
    expect(await marks()).toHaveLength(2);

    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Backspace');

    const left = await marks();

    expect(left).toHaveLength(1);
    expect(left[0].label).toBe('Too thick');
    expect(app.errors).toEqual([]);
  });
});
