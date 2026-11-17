import { buildCheckPage } from './buildCheckFixtures';
import { routedSceneBackend } from './boardRoutedScene.mjs';
import { openKitScene } from './kitScene';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { openApp, shown } from './harness';
import { command, type Studio } from './boardFixture';
import { completedRoutedFixture, routeFixtureBoard } from '../tools/electrical/routedFixtures';
import { encodeSceneFile } from '../src/utils/sceneFile';
import { drillFacts, gerberFacts } from '../tools/electrical/fabricationFacts.mjs';
import { routedBoardBackend } from './boardRoutedBackend';

export async function routedBoardWalkthrough(capture?: (page: Page, state: string) => Promise<void>) {
  const fixture = await completedRoutedFixture();
  const source = fixture.base.snapshot;
  const scene = await encodeSceneFile({
    parts: source.parts,
    project: source.project,
    name: 'Routed arm',
    globalGoal: '',
    annotations: [],
  });
  const app = await openApp();
  const { page } = app;
  const stop = await routedBoardBackend(page);
  const closeScenes = await routedSceneBackend(page);

  try {
    await openKitScene(page, { name: 'Blank', parts: [], project: DEFAULT_PROJECT });

    const chooser = page.waitForEvent('filechooser');

    await command(page, 'Open Scene File');
    await (
      await chooser
    ).setFiles({ name: 'routed-arm.basecase', mimeType: 'application/octet-stream', buffer: Buffer.from(scene) });
    await page.getByRole('tab', { name: 'Routed arm', exact: true }).click();
    await command(page, 'Edit Board');
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    const exported = page.waitForEvent('download');

    await page.getByRole('menuitem', { name: 'Schematic', exact: true }).click();

    const original = unzipSync(await readFile((await (await exported).path())!));
    const pcb = routeFixtureBoard(strFromU8(original['robot/robot.kicad_pcb']));
    const importFile = page.waitForEvent('filechooser');
    const validated = page.waitForResponse((response) => response.url().endsWith('/electrical-validate'));

    await page.getByRole('button', { name: 'Import Board', exact: true }).click();
    await (
      await importFile
    ).setFiles({ name: 'robot.kicad_pcb', mimeType: 'application/octet-stream', buffer: Buffer.from(pcb) });
    await validated;
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard
            ?.routed?.pcb,
      )
      .toBe(pcb);
    await capture?.(page, 'requirements');
    await command(page, 'Edit Board');
    await page.getByRole('button', { name: 'Fabrication', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Fabrication source', exact: true })
      .fill('https://jlcpcb.com/capabilities/pcb-capabilities');

    for (const [label, value] of [
      ['Minimum clearance', '0.2'],
      ['Minimum track width', '0.25'],
      ['Minimum drill', '0.3'],
    ]) {
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
      await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
    }

    expect(
      (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard?.routed
        ?.rules,
    ).toEqual({
      source: 'https://jlcpcb.com/capabilities/pcb-capabilities',
      clearanceMm: 0.2,
      trackWidthMm: 0.25,
      drillMm: 0.3,
    });

    await capture?.(page, 'manufacturing');
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    const fabricated = page.waitForEvent('download');

    await page.getByRole('menuitem', { name: 'Schematic', exact: true }).click();

    const files = unzipSync(await readFile((await (await fabricated).path())!));
    const manifest = JSON.parse(strFromU8(files['robot/manifest.json']));

    expect(strFromU8(files['robot/robot.kicad_pcb'])).toBe(pcb);
    expect(manifest.boardHash).toBe(createHash('sha256').update(pcb).digest('hex'));
    expect(gerberFacts(strFromU8(files['robot/fabrication/robot-F_Cu.gbr'])).function).toBe('Copper,L1,Top');
    expect(drillFacts(strFromU8(files['robot/fabrication/robot-PTH.drl']))).toHaveLength(6);
    expect(drillFacts(strFromU8(files['robot/fabrication/robot-NPTH.drl']))).toHaveLength(4);

    for (const [name, hash] of Object.entries(manifest.hashes))
      expect(createHash('sha256').update(files[`robot/${name}`]).digest('hex')).toBe(hash);

    const requirements = JSON.parse(strFromU8(files['robot/requirements.json']));

    expect(requirements.projection.requirements.length).toBeGreaterThan(0);
    expect(requirements.projection.electricalVerdict).toBe('not-established');
    await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const checks = buildCheckPage(() => page);
    const supply = checks.checkRow('Servo voltage');

    await checks.expand(supply, 'Servo voltage');
    await supply.getByRole('textbox', { name: 'Supply voltage', exact: true }).fill('48');
    await supply.getByRole('textbox', { name: 'Supply voltage', exact: true }).press('Enter');
    await checks.expand(checks.checkRow('Electrical connections'), 'Electrical connections');
    await expect
      .poll(() =>
        page
          .getByText('Import the routed board again after updating the electrical or mechanical inputs.', {
            exact: true,
          })
          .isVisible(),
      )
      .toBe(true);
    await capture?.(page, 'stale');
    expect(app.errors).toEqual([]);
  } finally {
    stop();
    await app.close();
    await closeScenes();
  }
}
