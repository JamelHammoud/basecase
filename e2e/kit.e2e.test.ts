import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { openApp, partCount, type App } from './harness';
import type { KitManifest } from '../src/kit/types';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  lastDownload: () => { name: string; base64: string } | null;
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

it.each(['desktop', 'web'])(
  'exports an arm through Export on %s with matching manufacturing identities',
  async (surface) => {
    if (surface === 'web') {
      await app.page.goto(inject('webUrl'));
      await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));
    }

    const scene = kitArmScene();

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
    await app.page.getByRole('button', { name: 'Export', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'Kit', exact: true }).click();
    await expect
      .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload()?.name))
      .toBe('kit-arm-kit.zip');

    const download = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());
    const files = unzipSync(Buffer.from(download!.base64, 'base64'));
    const manifest = JSON.parse(strFromU8(files['kit.json'])) as KitManifest;
    const map = JSON.parse(strFromU8(files['joint_map.json']));

    expect(manifest.servos.map((servo) => servo.entry)).toEqual(map.joints);
    expect(manifest.servos.some((servo) => servo.entry.servo?.variant === 'c001')).toBe(true);
    expect(manifest.packing.some((row) => row.step !== null && row.module !== null)).toBe(true);
    expect(strFromU8(files['build-guide.html'])).toContain('Kit arm');

    const plate = unzipSync(files[`plates/${manifest.printed[0].outputs[0].file}`]);

    expect(strFromU8(plate['3D/3dmodel.model'])).toContain('<mesh>');
    expect(app.errors).toEqual([]);
  },
);
