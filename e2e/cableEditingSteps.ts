import { expect } from 'vitest';
import type { App } from './harness';

interface Studio {
  lastDownload: () => { name: string; base64: string } | null;
  clear: () => void;
  dropFiles: (files: Array<{ name: string; base64: string }>) => Promise<void>;
  bomLines: () => Array<{ key: string }>;
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
