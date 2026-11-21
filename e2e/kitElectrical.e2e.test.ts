import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { completedRoutedFixture } from '../tools/electrical/routedFixtures';
import { openApp, partCount } from './harness';
import { openKitScene } from './kitScene';
import { stubKitGuideWorker } from './kitGuideWorker';
import { routedBoardBackend } from './boardRoutedBackend';
import type { KitManifest } from '../src/kit/types';

it.each(['routed', 'edited'] as const)('downloads the %s carrier through Export Kit', { retry: 0 }, async (mode) => {
  const fixture = await completedRoutedFixture();
  const scene = structuredClone({ name: 'Electrical kit', parts: fixture.input.parts, project: fixture.input.project });

  if (mode === 'edited') scene.project.electronicsBoard!.holes[0].diameterMm = 4;

  const app = await openApp();
  const stop = await routedBoardBackend(app.page);

  try {
    await stubKitGuideWorker(app.page);
    await openKitScene(app.page, scene);
    await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
    await app.page.getByRole('button', { name: 'Export', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'Kit', exact: true }).click();

    const delivery = app.page.waitForEvent('download');

    await app.page
      .getByRole('dialog', { name: 'Kit', exact: true })
      .getByRole('button', { name: 'Export', exact: true })
      .click();

    const files = unzipSync(await readFile((await (await delivery).path())!));
    const manifest = JSON.parse(strFromU8(files['kit.json'])) as KitManifest;
    const evidence = JSON.parse(strFromU8(files['electrical/manifest.json']));

    expect(manifest.electrical?.designFingerprint).toBe(manifest.design.fingerprint);
    expect(manifest.electrical?.boardHash).toBe(evidence.boardHash);
    expect(files['electrical/robot.kicad_sch']).toBeDefined();
    expect(strFromU8(files['electrical/robot.kicad_pcb'])).toBe(fixture.pcb);
    expect(manifest.printed.some((part) => part.id === 'board')).toBe(false);
    expect(manifest.fabricated).toEqual([{ partId: 'board', process: 'PCB', qty: 1 }]);
    expect(manifest.purchases.find((line) => line.key === 'component:jst-b3b-eh-a')?.qty).toBe(2);
    expect(
      manifest.packing
        .filter((row) => row.key.startsWith('hardware:') && row.partIds.some((id) => id.startsWith('board_mount')))
        .reduce((n, row) => n + row.qty, 0),
    ).toBe(8);

    for (const [path, hash] of Object.entries(evidence.hashes))
      expect(createHash('sha256').update(files[`electrical/${path}`]).digest('hex')).toBe(hash);

    expect(manifest.electrical?.fabrication).toBe(mode === 'routed' ? 'included' : 'missing');
    expect(Object.keys(files).filter((path) => path.startsWith('electrical/fabrication/'))).toHaveLength(
      mode === 'routed' ? 10 : 0,
    );

    if (mode === 'edited')
      await expect.poll(() => app.page.locator('body').innerText()).toContain('Exported kit without PCB fabrication.');

    expect(app.errors).toEqual([]);
  } finally {
    stop();
    await app.close();
  }
});
