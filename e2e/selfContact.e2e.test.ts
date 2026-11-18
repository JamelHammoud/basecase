import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { selfContactArmScene } from '../src/sim/fixtures/selfContactArm';
import { state } from './closedLinkageSteps';
import { contactCommand as command, retainSelfContactSceneFiles } from './selfContactScene';

let app: App;

beforeAll(async () => {
  app = await openApp({ scenes: [] });
  await retainSelfContactSceneFiles(app.page);
});

afterAll(async () => {
  await app?.close();
});

it('enables folding-arm contact, stops at the base, saves and reopens it, and disables contact for the passing control', async () => {
  await app.page.evaluate(
    (scene) => (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load(scene),
    selfContactArmScene(),
  );
  await command(app, 'Show Simulate');
  await app.page.getByRole('switch', { name: /^Self-contact for/ }).click();
  await app.page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect.poll(async () => (await state(app)).playing).toBe(true);
  await app.page.locator(shown('select[aria-label="Controller"]')).selectOption({ label: 'Fold' });
  await expect.poll(async () => (await state(app)).joints.elbow?.position ?? 0).toBeLessThan(-50);
  await expect
    .poll(async () =>
      app.page.evaluate(() =>
        (window as unknown as { __studio: { selfContactPairs: () => string[][] } }).__studio.selfContactPairs(),
      ),
    )
    .toContainEqual(['base', 'tip']);
  expect((await state(app)).joints.elbow.position).toBeGreaterThan(-85);
  await command(app, 'Stop Simulation');
  await command(app, 'Export Scene');

  await expect
    .poll(() =>
      app.page.evaluate(
        () =>
          (window as unknown as { __studio: { lastDownload: () => { name: string } | null } }).__studio.lastDownload()
            ?.name,
      ),
    )
    .toMatch(/\.basecase$/);

  const file = await app.page.evaluate(() =>
    (
      window as unknown as { __studio: { lastDownload: () => { name: string; base64: string } | null } }
    ).__studio.lastDownload(),
  );

  expect(file?.name).toMatch(/\.basecase$/);
  await app.page.evaluate(async (file) => {
    const studio = (
      window as unknown as { __studio: { clear: () => void; dropFiles: (files: unknown[]) => Promise<void> } }
    ).__studio;

    studio.clear();
    await studio.dropFiles([file]);
  }, file);
  await expect
    .poll(() =>
      app.page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length),
    )
    .toBe(3);
  await command(app, 'Show Simulate');
  await expect
    .poll(() => app.page.getByRole('switch', { name: /^Self-contact for/ }).getAttribute('aria-checked'))
    .toBe('true');
  await app.page.getByRole('switch', { name: /^Self-contact for/ }).click();
  await app.page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await expect.poll(async () => (await state(app)).playing).toBe(true);
  await app.page.locator(shown('select[aria-label="Controller"]')).selectOption({ label: 'Fold' });
  await expect.poll(async () => (await state(app)).joints.elbow?.position ?? 0).toBeLessThan(-88);
  expect(app.errors).toEqual([]);
});
