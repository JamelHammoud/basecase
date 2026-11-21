import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { selfContactArmScene } from '../src/sim/fixtures/selfContactArm';
import { contactCommand as command, retainSelfContactSceneFiles } from './selfContactScene';

let app: App;

beforeAll(async () => {
  app = await openApp({ scenes: [] });
  await retainSelfContactSceneFiles(app.page);
});

afterAll(async () => {
  await app?.close();
});

it('retains the authored Self-contact switch through scene export and reopening', async () => {
  await app.page.evaluate(
    (scene) => (window as unknown as { __studio: { load: (scene: unknown) => void } }).__studio.load(scene),
    selfContactArmScene(),
  );
  await command(app, 'Show Simulate');

  const toggle = app.page.getByRole('switch', { name: /^Self-contact for/ });

  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false');
  await toggle.click();
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true');
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
  await toggle.click();
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false');
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
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true');
  expect(app.errors).toEqual([]);
});
