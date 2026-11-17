import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { openApp, shown } from './harness';
import { buildCheckPage } from './buildCheckFixtures';
import { command, openRover, type Studio } from './boardFixture';
import { boardPcbFacts } from './boardPcb';
import type { BoardTerminal } from '../src/wiring/boardTypes';

it('defines, edits and locks the generated rover board, exports its PCB and reopens the same placement', async () => {
  const app = await openApp();

  try {
    const { page } = app;

    await openRover(page);
    await page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('120');
    await page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
    await page
      .locator('section')
      .filter({ has: page.getByRole('button', { name: 'B3B-EH-A', exact: true }) })
      .getByRole('switch', { name: 'Locked', exact: true })
      .click();

    const original = await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

    expect(original.project.electronicsBoard?.placements.find((item) => item.id === 'connector_pan')?.locked).toBe(
      true,
    );

    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())
          ).project.electronicsBoard?.placements.find((item) => item.id === 'connector_pan')?.locked,
      )
      .toBe(false);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard,
      )
      .toEqual(original.project.electronicsBoard);
    await page.getByRole('button', { name: 'Export', exact: true }).click();

    const delivery = page.waitForEvent('download');

    await page.getByRole('menuitem', { name: 'Schematic', exact: true }).click();

    const files = unzipSync(await readFile((await (await delivery).path())!));
    const pcb = strFromU8(files['robot/robot.kicad_pcb']);
    const report: { terminals: BoardTerminal[] } = JSON.parse(strFromU8(files['robot/placement.json']));
    const facts = boardPcbFacts(pcb);

    expect(facts.outline).toEqual([
      { start: [-60, -40], end: [60, -40] },
      { start: [60, -40], end: [60, 40] },
      { start: [60, 40], end: [-60, 40] },
      { start: [-60, 40], end: [-60, -40] },
    ]);
    expect(facts.thickness).toBeCloseTo(1.6, 12);
    expect(facts.holes.map((hole) => hole.drill).sort()).toEqual([2.18, 2.18, 2.18, 3.2, 3.2, 3.2, 3.2]);
    expect(report.terminals).toHaveLength(11);

    for (const terminal of report.terminals) {
      const footprint = facts.footprints.find((item) => item.reference === terminal.reference);

      expect(footprint?.pads.find((pad) => pad.number === terminal.pad)?.net).toBe(`/${terminal.net}`);
    }

    const sceneDelivery = page.waitForEvent('download');

    await command(page, 'Export Scene');

    const saved = await readFile((await (await sceneDelivery).path())!);
    const tabs = await page.locator('[data-tab-close]').count();
    const chooser = page.waitForEvent('filechooser');

    await command(page, 'Open Scene File');
    await (
      await chooser
    ).setFiles({ name: 'board-reopened.basecase', mimeType: 'application/octet-stream', buffer: Buffer.from(saved) });
    await expect.poll(() => page.locator('[data-tab-close]').count()).toBe(tabs + 1);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard,
      )
      .toEqual(original.project.electronicsBoard);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

it('reports an outline shrink as a mechanical board blocker', async () => {
  const app = await openApp();

  try {
    await openRover(app.page);
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('5');
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = buildCheckPage(() => app.page).checkRow('Board fit');

    await expect.poll(() => row.getAttribute('data-status')).toBe('fail');
  } finally {
    await app.close();
  }
});
