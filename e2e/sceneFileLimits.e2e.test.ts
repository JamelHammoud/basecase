import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { openApp } from './harness';

it('refuses an inflated scene through Open Scene File and still opens a normal scene', async () => {
  const app = await openApp();

  try {
    const { page } = app;
    const choose = async (buffer: Buffer) => {
      const picker = page.waitForEvent('filechooser');

      await page.keyboard.press('Meta+k');
      await page.locator('[cmdk-input]').fill('Open Scene File');
      await page.locator('[cmdk-input]').press('Enter');
      await (await picker).setFiles({ name: 'limit.basecase', mimeType: 'application/octet-stream', buffer });
    };

    await choose(gzipSync(Buffer.alloc(128 * 1024 * 1024 + 1, 32)));
    await page
      .getByText(
        'Couldn’t open limit.basecase. That scene exceeds 128 MB. Remove large meshes or images and export it again.',
        { exact: true },
      )
      .waitFor();
    expect(app.posts.filter((post) => post.route === 'save-scene')).toHaveLength(0);

    const file = { format: 'basecase-scene', version: 1, scene: { name: 'Small scene', parts: [] } };

    await choose(gzipSync(JSON.stringify(file)));
    await page.getByRole('tab', { name: /Small scene/ }).waitFor();
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
