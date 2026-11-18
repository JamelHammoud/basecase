import { expect, it } from 'vitest';
import { completedRoutedFixture } from '../tools/electrical/routedFixtures';
import { openApp } from './harness';
import { openKitScene } from './kitScene';
import { command, type Studio } from './boardFixture';
import { routedBoardBackend } from './boardRoutedBackend';

it('imports a routed KiCad derivative through the Inspector with undo and redo', { retry: 0 }, async () => {
  const fixture = await completedRoutedFixture();
  const source = fixture.base.snapshot;
  const app = await openApp();
  const { page } = app;
  const stop = await routedBoardBackend(page);
  const currentBoard = async () =>
    (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard;

  try {
    await openKitScene(page, { name: 'Routed arm', parts: source.parts, project: source.project });
    await command(page, 'Edit Board');

    const original = await currentBoard();
    const chooser = page.waitForEvent('filechooser');

    expect(original?.routed).toBeUndefined();
    await page.getByRole('button', { name: 'Import Board', exact: true }).click();
    await (
      await chooser
    ).setFiles({ name: 'robot.kicad_pcb', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture.pcb) });
    await expect.poll(async () => (await currentBoard())?.routed?.pcb).toBe(fixture.pcb);

    const imported = await currentBoard();

    expect(imported?.routed?.evidence?.version).toBe('9.0.6');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(currentBoard).toEqual(original);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(currentBoard).toEqual(imported);
    expect(app.errors).toEqual([]);
  } finally {
    stop();
    await app.close();
  }
});
