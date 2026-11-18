import { expect } from 'vitest';
import type { Net } from '../src/wiring/connectors';
import { shown, type App } from './harness';
import { contactCommand as command } from './selfContactScene';

interface Studio {
  lastDownload: () => { name: string; base64: string } | null;
  clear: () => void;
  dropFiles: (files: Array<{ name: string; base64: string }>) => Promise<void>;
  bomLines: () => Array<{ key: string }>;
  buildAlongRoutes: () => Net[];
}

export const cableLines = (app: App) =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio
      .bomLines()
      .map((line) => line.key)
      .filter((key) => key.includes('cable')),
  );

export async function reopenCableScene(app: App) {
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload()?.name))
    .toMatch(/\.basecase$/);

  const file = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());

  await app.page.evaluate(async (file) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.clear();
    await studio.dropFiles([file!]);
  }, file);
}

export async function showCableBuildAlong(app: App, partIds: string[]) {
  await command(app, 'Build Along');

  const toolbar = app.page.locator(shown('[role=toolbar][aria-label="Build Along"]'));

  await expect.poll(() => toolbar.count()).toBe(1);

  for (let index = 0; index < partIds.length; index++) {
    const route = await app.page.evaluate(
      () =>
        (window as unknown as { __studio: Studio }).__studio.buildAlongRoutes().find((net) => net.from.id === 'adapter')
          ?.route,
    );

    if (route) {
      expect(route).toMatchObject({
        cableSupplyId: 'waveshare-servo-cable-5264-900',
        points: expect.arrayContaining([[0, 80, 0]]),
      });

      return;
    }

    const next = toolbar.getByRole('button', { name: /^Next step/ });
    const before = Number(await toolbar.getAttribute('data-step'));

    if (!(await next.isEnabled())) break;

    await next.click();
    await expect.poll(async () => Number(await toolbar.getAttribute('data-step'))).toBe(before + 1);
  }

  throw new Error('The authored cable route is missing from Build Along.');
}
