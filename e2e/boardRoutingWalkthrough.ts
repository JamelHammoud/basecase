import { expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { openApp } from './harness';
import { openRover, type Studio } from './boardFixture';
import { routedBoardBackend } from './boardRoutedBackend';
import { routedSceneBackend } from './boardRoutedScene.mjs';
import { reconcileRoutedBoard } from '../src/wiring/boardReconcile.mjs';

import type { Page } from 'playwright-core';

export async function boardRoutingWalkthrough(capture?: (page: Page, state: string) => Promise<void>) {
  const app = await openApp();
  const { page } = app;
  const stop = await routedBoardBackend(page);
  const closeScenes = await routedSceneBackend(page);

  try {
    await openRover(page, true);
    await page.getByRole('button', { name: 'Fabrication', exact: true }).click();
    await page.getByRole('textbox', { name: 'Fabrication source', exact: true }).fill('https://example.com/process');

    for (const [label, value] of [
      ['Minimum clearance', '0.2'],
      ['Minimum track width', '0.25'],
      ['Minimum drill', '0.3'],
    ]) {
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
      await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
    }

    await page.getByRole('button', { name: 'Routing', exact: true }).click();
    await page.getByRole('textbox', { name: 'Routing source', exact: true }).fill('https://example.com/design');
    await page.getByRole('textbox', { name: 'Dielectric material', exact: true }).fill('FR4');

    const loss = page.getByRole('textbox', { name: 'Dielectric loss tangent', exact: true });

    expect(await loss.inputValue()).toBe('');
    expect(await loss.locator('..').innerText()).toBe('');
    expect(
      await page.getByRole('textbox', { name: 'Dielectric permittivity', exact: true }).locator('..').innerText(),
    ).toBe('');
    await loss.fill('0');
    await loss.press('Enter');
    expect(
      (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard
        ?.routing?.lossTangent,
    ).toBe(0);

    for (const [label, value] of [
      ['Track width', '0.4'],
      ['Copper clearance', '0.25'],
      ['Via diameter', '0.8'],
      ['Via drill', '0.4'],
      ['Copper thickness', '0.035'],
      ['Dielectric permittivity', '4.5'],
      ['Dielectric loss tangent', '0.02'],
    ]) {
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
      await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
    }

    await capture?.(page, 'requirements');

    const original = await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());
    const completion = page.waitForResponse((response) => response.url().endsWith('/electrical-validate'));

    await page.getByRole('button', { name: 'Route Board', exact: true }).click();
    await completion;
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard
            ?.routed?.evidence?.issues,
      )
      .toEqual([]);
    await capture?.(page, 'routed');
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    const delivery = page.waitForEvent('download');

    await page.getByRole('menuitem', { name: 'Schematic', exact: true }).click();

    const files = unzipSync(await readFile((await (await delivery).path())!));
    const source = strFromU8(files['robot/robot.kicad_pcb']);
    const validation = JSON.parse(strFromU8(files['robot/validation.json']));
    const manifest = JSON.parse(strFromU8(files['robot/manifest.json']));
    const comparison = reconcileRoutedBoard({
      expected: strFromU8(files['robot/current-unrouted.kicad_pcb']),
      imported: source,
      sourceFingerprint: manifest.sourceFingerprint,
    });

    expect(comparison.accepted).toBe(true);
    expect(source).toContain('(segment');
    expect(validation.issues).toEqual([]);
    expect(Object.keys(files).filter((name) => name.startsWith('robot/fabrication/'))).toHaveLength(10);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard,
      )
      .toEqual(original.project.electronicsBoard);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard
            ?.routed?.pcb,
      )
      .toBe(source);
    expect(app.errors).toEqual([]);
  } finally {
    stop();
    await app.close();
    await closeScenes();
  }
}
