import { readFile } from 'node:fs/promises';
import { expect, inject, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { openKitScene } from './kitScene';
import { kitGuideReply, stubKitGuideWorker } from './kitGuideWorker';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { guideFingerprint } from '../src/guide/guideFingerprint';
import { openApp, partCount } from './harness';
import type { KitManifest } from '../src/kit/types';

function exportScene() {
  const scene = kitArmScene();
  const guideId = 'kit-source-guide';
  const generatedAt = '2026-11-16T00:00:00.000Z';
  const guide = kitGuideReply({
    guideId,
    title: scene.name,
    parts: scene.parts,
    partKeys: Object.fromEntries(scene.parts.map((part) => [part.id, part.id])),
    project: scene.project,
    date: generatedAt,
    mark: '',
  });

  scene.project.buildGuide = {
    id: guideId,
    pages: guide.pages,
    steps: guide.plan.steps.length,
    generatedAt,
    fingerprint: guideFingerprint(scene.name, scene.parts, scene.project),
    coverDataUrl: guide.coverDataUrl,
  };

  return scene;
}

it.each(['desktop', 'web'])(
  'downloads a reconciled kit through Export on %s with matching packing, guide, servo map and 3MF mesh',
  async (surface) => {
    const app = await openApp();

    try {
      const scene = exportScene();
      const guides = await stubKitGuideWorker(app.page);

      await openKitScene(app.page, scene, surface === 'web' ? inject('webUrl') : undefined);

      await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
      expect(
        await app.page.evaluate(
          () =>
            (window as unknown as { __studio: { simState: () => { activeCase: string | null } } }).__studio.simState()
              .activeCase,
        ),
      ).toBeNull();
      expect(app.requests.some((url) => url.includes('/gallery/rover-reach-the-flag.json'))).toBe(false);
      await app.page.getByRole('button', { name: 'Export', exact: true }).click();

      await app.page.getByRole('menuitem', { name: 'Kit', exact: true }).click();

      const [download] = await Promise.all([
        app.page.waitForEvent('download', { timeout: 10000 }),
        app.page
          .getByRole('dialog', { name: 'Kit', exact: true })
          .getByRole('button', { name: 'Export', exact: true })
          .click(),
      ]).catch(async (error: unknown) => {
        const evidence = await app.page.evaluate(() => ({
          screen: document.body.innerText,
          preparation: performance
            .getEntriesByType('measure')
            .filter((entry) => entry.name.startsWith('kit:'))
            .map((entry) => ({
              name: entry.name,
              duration: entry.duration,
              detail: (entry as PerformanceMeasure).detail,
            })),
        }));

        throw new Error(JSON.stringify(evidence), { cause: error });
      });

      expect(download.suggestedFilename()).toBe('kit-arm-kit.zip');
      expect(await download.failure()).toBeNull();

      const files = unzipSync(await readFile((await download.path())!));
      const manifest = JSON.parse(strFromU8(files['kit.json'])) as KitManifest;
      const map = JSON.parse(strFromU8(files['joint_map.json']));

      expect(manifest.servos.map((servo) => servo.entry)).toEqual(map.joints);
      expect(manifest.servos.map((servo) => servo.partId)).toEqual(['shoulder-servo']);
      expect(manifest.servos[0].entry.servo?.variant).toBe('c001');
      expect(manifest.packing.some((row) => row.step !== null && row.module !== null)).toBe(true);
      expect(strFromU8(files['build-guide.html'])).toContain('Kit arm');
      expect(guides).toHaveLength(1);
      expect(guides[0].job.project.buildGuide).toEqual(scene.project.buildGuide);
      expect(guides[0].job.parts.map((part) => part.id)).toEqual(scene.parts.map((part) => part.id));
      expect(guides[0].job.project.joints).toEqual(scene.project.joints);
      expect(guides[0].job.order).toBeDefined();
      expect(new Set([...guides[0].job.order!.assembly, ...guides[0].job.order!.unproven])).toEqual(
        new Set(scene.parts.map((part) => part.id)),
      );
      expect(strFromU8(files['build-guide.html'])).toBe(guides[0].result.html);

      const plate = unzipSync(files[`plates/${manifest.printed[0].outputs[0].file}`]);

      expect(strFromU8(plate['3D/3dmodel.model'])).toContain('<mesh>');
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);
