import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, inject, it } from 'vitest';
import { appearanceDesign } from '../src/appearance/appearance.fixtures';
import { finishAppearance } from '../src/appearance/model';
import type { CompositionSettings } from '../src/three/composition/settings';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { encodeSceneFile } from '../src/utils/sceneFile';
import { openApp, shown } from './harness';
import { openKitScene } from './kitScene';
import { startCompositionTrace, stopCompositionTrace } from './renderCompositionTiming';
import { expectPanelReadable } from './appearanceLayout';
import { narrowCompositionCanvas } from './renderCompositionLayout';

async function pngSummary(page: import('playwright-core').Page, png: Buffer) {
  return page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;

    context.drawImage(bitmap, 0, 0);

    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const alpha = Array.from(pixels).filter((_, index) => index % 4 === 3);

    bitmap.close();

    return {
      width: canvas.width,
      height: canvas.height,
      alpha: alpha[0],
      foreground: alpha.filter((a) => a > 0).length,
    };
  }, Array.from(png));
}

it('opens a finished arm, composes and downloads a transparent PNG while preserving the editing scene', async () => {
  const app = await openApp();

  try {
    const arm = appearanceDesign(1);
    const parts = arm.parts.map((part) => ({ ...part, appearance: finishAppearance('metal', part.color) }));
    const project = { ...DEFAULT_PROJECT, joints: arm.joints };
    const bytes = await encodeSceneFile({ name: 'Finished arm', globalGoal: '', annotations: [], parts, project });

    await openKitScene(app.page, { name: 'Blank', parts: [], project: DEFAULT_PROJECT }, inject('webUrl'));

    const chooser = app.page.waitForEvent('filechooser');

    await app.page.keyboard.press('ControlOrMeta+k');
    await app.page.keyboard.type('Open Scene File');
    await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Open Scene File' }).click();
    await (
      await chooser
    ).setFiles({ name: 'arm.basecase', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await app.page.getByRole('tab', { name: 'Finished arm', exact: true }).click();
    await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).click();
    await app.page.locator(shown('[data-layer-row]')).filter({ hasText: parts[0].name }).first().click();

    const before = await app.page.evaluate(() => {
      const studio = (window as unknown as { __studio: { sceneRecord: () => unknown; selection: () => unknown } })
        .__studio;

      return { scene: studio.sceneRecord(), state: studio.selection() };
    });

    await app.page.getByRole('button', { name: 'Render Image', exact: true }).click();

    const panel = app.page.getByRole('region', { name: 'Render image', exact: true });

    await panel.getByRole('textbox', { name: 'Lighting', exact: true }).fill('2');
    await panel.getByRole('textbox', { name: 'Lighting', exact: true }).press('Enter');
    await panel.getByRole('switch', { name: 'Transparent', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Width', exact: true }).fill('320');
    await panel.getByRole('textbox', { name: 'Width', exact: true }).press('Enter');
    await panel.getByRole('textbox', { name: 'Height', exact: true }).fill('240');
    await panel.getByRole('textbox', { name: 'Height', exact: true }).press('Enter');
    await expectPanelReadable(panel);
    await panel.getByRole('button', { name: 'Frame Scene', exact: true }).click();

    const delivered = app.page.waitForEvent('download');

    await startCompositionTrace(app.page);
    await panel.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await app.page.locator(shown('[data-layer-row]')).filter({ hasText: parts[1].name }).first().click();
    await expect
      .poll(() =>
        app.page.evaluate(() =>
          (window as unknown as { __studio: { selection: () => string[] } }).__studio.selection(),
        ),
      )
      .toEqual([parts[1].id]);
    await app.page.locator(shown('[data-layer-row]')).filter({ hasText: parts[0].name }).first().click();

    const download = await delivered;
    const timing = await stopCompositionTrace(app.page);

    await mkdir('scratch', { recursive: true });
    await writeFile('scratch/render-composition-browser.json', JSON.stringify(timing));

    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe('finished-arm.png');

    const png = await readFile((await download.path())!);
    const image = await pngSummary(app.page, png);

    expect(image).toEqual({ width: 320, height: 240, alpha: 0, foreground: expect.any(Number) });
    expect(image.foreground).toBeGreaterThan(100);
    await expectPanelReadable(panel);
    await panel.getByRole('button', { name: 'Done', exact: true }).click();

    const after = await app.page.evaluate(() => {
      const studio = (
        window as unknown as { __studio: { sceneRecord: () => { parts: unknown }; selection: () => unknown } }
      ).__studio;

      return { parts: studio.sceneRecord().parts, state: studio.selection() };
    });

    expect(after.parts).toEqual((before.scene as { parts: unknown }).parts);
    expect(after.state).toEqual(before.state);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

it('keeps composition fields readable on a narrow canvas and cancels drafts before closing', async () => {
  const app = await openApp();
  let release = () => {};

  try {
    await openKitScene(app.page, { name: 'Empty composition', parts: [], project: DEFAULT_PROJECT }, inject('webUrl'));
    await narrowCompositionCanvas(app.page);
    await app.page.getByRole('button', { name: 'Render Image', exact: true }).click();

    const panel = app.page.getByRole('region', { name: 'Render image', exact: true });
    const width = panel.getByRole('textbox', { name: 'Width', exact: true });

    await width.fill('4096');
    await width.press('Enter');
    await panel.getByRole('textbox', { name: 'Height', exact: true }).fill('2048');
    await panel.getByRole('textbox', { name: 'Height', exact: true }).press('Enter');
    await panel.getByRole('textbox', { name: 'Environment rotation', exact: true }).fill('-360');
    await panel.getByRole('textbox', { name: 'Environment rotation', exact: true }).press('Enter');
    await width.fill('123');
    await width.press('Escape');
    expect(await panel.count()).toBe(1);
    expect(await width.inputValue()).toBe('4096');

    const background = panel.getByRole('textbox', { name: 'Hex color', exact: true });
    const original = await background.inputValue();

    await background.fill('ABCDEF');
    await background.press('Escape');
    expect(await panel.count()).toBe(1);
    expect(await background.inputValue()).toBe(original);
    await expectPanelReadable(panel);

    const containment = await panel.evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const canvas = element.closest('[data-canvas-card]')!.getBoundingClientRect();

      return { left: panel.left - canvas.left, right: canvas.right - panel.right };
    });

    expect(containment.left).toBeGreaterThanOrEqual(12);
    expect(containment.right).toBeGreaterThanOrEqual(12);
    await panel.getByRole('button', { name: 'Use Current View', exact: true }).focus();
    await app.page.keyboard.press('ControlOrMeta+k');
    await app.page.getByPlaceholder('Search commands').waitFor();
    await app.page.keyboard.press('Escape');
    expect(await panel.count()).toBe(1);

    let requested = () => {};
    const waiting = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workerPath = /\/composition\.worker[.-]/;

    await app.page.context().route(workerPath, async (route) => {
      requested();
      await gate;
      await route.continue();
    });
    await panel.getByRole('button', { name: 'Preview', exact: true }).click();
    await waiting;
    await expectPanelReadable(panel);
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    release();
    await app.page.context().unroute(workerPath);
    await panel.getByRole('button', { name: 'Preview', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    expect(await panel.getByRole('alert').textContent()).toBe('Show a solid part before rendering.');
    await expectPanelReadable(panel);
    await app.page.keyboard.press('Escape');
    expect(await panel.count()).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    release();
    await app.close();
  }
});

it('reopens saved composition settings through the command palette', async () => {
  const app = await openApp();

  try {
    const rendering: CompositionSettings = {
      width: 640,
      height: 480,
      lighting: 2,
      exposure: 1,
      rotation: 123,
      background: '#333333',
      transparent: true,
      view: {
        position: [170, 135, 180] as [number, number, number],
        target: [0, 18, 0] as [number, number, number],
        hfovDeg: 60,
      },
    };

    await openKitScene(
      app.page,
      { name: 'Saved composition', parts: appearanceDesign(1).parts, project: { ...DEFAULT_PROJECT, rendering } },
      inject('webUrl'),
    );
    await app.page.keyboard.press('ControlOrMeta+k');
    await app.page.keyboard.type('Render Image');
    await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Render Image' }).click();

    const panel = app.page.getByRole('region', { name: 'Render image', exact: true });

    expect(await panel.getByRole('textbox', { name: 'Environment rotation', exact: true }).inputValue()).toBe('123');
    expect(await panel.getByRole('textbox', { name: 'Width', exact: true }).inputValue()).toBe('640');
    expect(await panel.getByRole('switch', { name: 'Transparent', exact: true }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await app.page.keyboard.press('Escape');
    expect(await panel.count()).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
