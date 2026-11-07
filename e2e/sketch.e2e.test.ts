import type { Locator } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;
const pad = () => app.page.locator(visible('[aria-label="Sketch canvas"]'));
const composerBox = () => app.page.locator(visible('textarea'));
const padButton = (name: string) =>
  app.page.locator(visible('[role=group][aria-label="Sketch"] button'), { hasText: name });
const uploads = () => app.posts.filter((p) => p.route === 'upload-image');

const inkReach = () =>
  pad().evaluate((canvas: HTMLCanvasElement) => {
    const { data, width } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let reach = 0;

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 128) reach = Math.max(reach, ((i - 3) / 4) % width);
    }

    return (reach * canvas.getBoundingClientRect().width) / width;
  });

const inkColor = () =>
  pad().evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 255) return [data[i - 3], data[i - 2], data[i - 1]];
    }

    return null;
  });

const padControl = (name: string) =>
  app.page.locator(visible(`[role=group][aria-label="Sketch"] button[aria-label="${name}"]`));

const isFullyRound = (button: Locator) =>
  button.evaluate((el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= el.offsetHeight / 2);

const openFromAttach = async () => {
  await app.page.locator(visible('button[aria-label="Attach"]')).click();
  await app.page.getByRole('menuitem', { name: 'Sketch' }).click();
};

const drawLine = async (fromX: number, toX: number) => {
  const box = (await pad().boundingBox())!;

  await app.page.mouse.move(box.x + fromX, box.y + 40);
  await app.page.mouse.down();
  await app.page.mouse.move(box.x + (fromX + toX) / 2, box.y + 90, { steps: 4 });
  await app.page.mouse.move(box.x + toX, box.y + 40, { steps: 4 });
  await app.page.mouse.up();
};

beforeAll(async () => {
  app = await openApp();
  await app.page.keyboard.press('a');
  await app.page.getByRole('button', { name: /^Cube/ }).first().click();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('sketch in the composer', () => {
  it('opens from the palette even when the Agent tab was never opened', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Sketch for Agent');
    await app.page.keyboard.press('Enter');

    await expect.poll(() => pad().count()).toBe(1);
    expect(await composerBox().count()).toBe(0);
    expect(await padControl('Undo').count()).toBe(0);
    expect(await isFullyRound(padButton('Done'))).toBe(true);
    expect(await isFullyRound(padControl('Back'))).toBe(true);
    expect(await padButton('Done').isDisabled()).toBe(true);
  });

  it('inks strokes, and Undo takes off only the sketch, never a scene edit', async () => {
    await app.page.locator(visible('[role=group][aria-label="Sketch"]')).focus();
    await app.page.keyboard.press('v');

    const before = await partCount(app.page);

    await drawLine(40, 200);
    await expect.poll(inkReach).toBeGreaterThan(195);

    await drawLine(60, 260);
    await expect.poll(inkReach).toBeGreaterThan(255);

    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(inkReach).toBeLessThan(205);

    expect(before).toBe(1);
    expect(await partCount(app.page)).toBe(before);
  });

  it('clears the drawing on Back and keeps the draft', async () => {
    await app.page.keyboard.press('Escape');
    await expect.poll(() => pad().count()).toBe(0);
    await expect.poll(() => composerBox().evaluate((el) => el === document.activeElement)).toBe(true);
    await composerBox().fill('Longer arm');

    await openFromAttach();
    await expect.poll(() => pad().count()).toBe(1);
    await expect.poll(inkReach).toBe(0);
    expect(await padButton('Done').isDisabled()).toBe(true);
  });

  it('inks in the picked color, and Esc closes the palette before the pad', async () => {
    expect(await padControl('Yellow').count()).toBe(0);

    await padControl('Color').click();
    await expect.poll(() => padControl('Yellow').count()).toBe(1);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => padControl('Yellow').count()).toBe(0);
    expect(await pad().count()).toBe(1);

    await padControl('Color').click();
    await padControl('Green').click();
    await expect.poll(() => padControl('Green').count()).toBe(0);

    await drawLine(40, 200);
    await expect.poll(inkColor).toEqual([34, 197, 94]);
  });

  it('attaches the drawing as an image on Done', async () => {
    await padButton('Done').click();

    await expect.poll(() => uploads().length).toBe(1);

    const { name, dataUrl } = uploads()[0].body as { name: string; dataUrl: string };

    expect(name).toBe('Sketch.png');
    expect(dataUrl.startsWith('data:image/png')).toBe(true);
    expect(await pad().count()).toBe(0);
    expect(await composerBox().inputValue()).toBe('Longer arm');
    expect(app.errors).toEqual([]);
  });

  it('starts the next sketch empty', async () => {
    await openFromAttach();

    await expect.poll(() => pad().count()).toBe(1);
    await expect.poll(inkReach).toBe(0);
    expect(await padButton('Done').isDisabled()).toBe(true);
  });
});
