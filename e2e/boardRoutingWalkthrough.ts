import { expect } from 'vitest';
import { openApp } from './harness';
import { command, type Studio } from './boardFixture';
import { openKitScene } from './kitScene';
import { routedBoardBackend } from './boardRoutedBackend';
import { boardFixtureInput } from '../tools/electrical/boardFixtures';
import { ROUTING_PLAN } from '../tools/electrical/routeFixtures';
import { FIXTURE_RULES } from '../tools/electrical/routedFixtures';
import { electricalScenes } from '../src/wiring/electricalFixtures';

export async function boardRoutingWalkthrough() {
  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
  const { input } = await boardFixtureInput(scene, ({ board, part }) => {
    part.position = [0, 500, 0];
    board.side = 'bottom';
    board.heightMm = { top: 30, bottom: 30 };
    board.placements = board.placements.map((placement, index) => ({
      ...placement,
      position: [0, index * 24 - 12],
      rotation: 90,
      locked: true,
      unplaced: false,
    }));
    board.fabrication = FIXTURE_RULES;
    board.routing = { ...ROUTING_PLAN, lossTangent: null };
  });
  const app = await openApp();
  const { page } = app;
  const stop = await routedBoardBackend(page);

  try {
    await openKitScene(page, { ...input, name: 'Board rover' });
    await command(page, 'Edit Board');
    await page.getByRole('button', { name: 'Routing', exact: true }).click();

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
    await loss.fill(String(ROUTING_PLAN.lossTangent));
    await loss.press('Enter');

    const original = await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());
    const completion = page.waitForResponse((response) => response.url().endsWith('/electrical-validate'));

    expect(original.project.electronicsBoard?.routed).toBeUndefined();
    await page.getByRole('button', { name: 'Route Board', exact: true }).click();
    await completion;
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard
            ?.routed?.evidence?.issues,
      )
      .toEqual([]);

    const routed = await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

    expect(routed.project.electronicsBoard?.routed?.pcb).toContain('(segment');
    expect(routed.project.electronicsBoard?.routed?.provenance?.engine).toBe('freerouting');
    expect(routed.parts).toEqual(original.parts);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord()))
      .toEqual(original);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).toEqual(routed);
    expect(app.errors).toEqual([]);
  } finally {
    stop();
    await app.close();
  }
}
