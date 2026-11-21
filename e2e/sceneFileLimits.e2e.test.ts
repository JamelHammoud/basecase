import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { openApp } from './harness';

it('refuses an inflated scene with readable recovery text and still opens a normal scene', async () => {
  const app = await openApp();

  try {
    const { page } = app;

    await page.setViewportSize({ width: 1240, height: 720 });

    const choose = async (buffer: Buffer) => {
      await page.keyboard.press('ControlOrMeta+k');
      await page.getByLabel('Search commands').fill('Open Scene File');

      const [picker] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);

      await picker.setFiles({ name: 'limit.basecase', mimeType: 'application/octet-stream', buffer });
    };

    await choose(gzipSync(Buffer.alloc(128 * 1024 * 1024 + 1, 32)));

    const message = page.getByText(
      'Couldn’t open limit.basecase. That scene exceeds 128 MB. Remove large meshes or images and export it again.',
      { exact: true },
    );

    await message.waitFor();

    const layout = await message.evaluate((element) => {
      const range = document.createRange();

      range.selectNodeContents(element);

      const text = element.getBoundingClientRect();
      const toast = element.closest('[role="status"]')!.getBoundingClientRect();
      const canvas = element.closest('main')!.getBoundingClientRect();

      return {
        clipped: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
        linesInside: [...range.getClientRects()].every(
          (line) =>
            line.left >= text.left && line.right <= text.right && line.top >= text.top && line.bottom <= text.bottom,
        ),
        insideCanvas: toast.left >= canvas.left && toast.right <= canvas.right,
        height: toast.height,
      };
    });

    expect(layout.clipped).toBe(false);
    expect(layout.linesInside).toBe(true);
    expect(layout.insideCanvas).toBe(true);
    expect(layout.height).toBeGreaterThan(40);
    expect(app.posts.filter((post) => post.route === 'save-scene')).toHaveLength(0);

    const file = { format: 'basecase-scene', version: 1, scene: { name: 'Small scene', parts: [] } };

    await choose(gzipSync(JSON.stringify(file)));
    await page.getByRole('tab', { name: /Small scene/ }).waitFor();
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
