import { routedSceneBackend } from './boardRoutedScene.mjs';
import { expect, it } from 'vitest';
import { openApp } from './harness';
import {
  assertTextureActionLayout,
  assertTextureEditingFields,
  narrowTextureInspector,
} from './simreadyConsent.helpers';

it('opens a shared SimReady part without downloading and offers textures in the Inspector', async () => {
  const app = await openApp();
  const closeScenes = await routedSceneBackend(app.page);
  const part = {
    id: 'shared-mug',
    name: 'Shared mug',
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [0, 20, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 40, height: 40, depth: 40 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    simready: {
      url: `https://huggingface.co/datasets/nvidia/simready-assets/blob/${'a'.repeat(40)}/Pack/root.usd`,
      name: 'Mug',
      maker: 'NVIDIA',
      license: '',
    },
    mesh: {
      positions: [0, 0, 0, 40, 0, 0, 0, 40, 0, 0, 0, 40],
      indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
      baseSize: [40, 40, 40],
      visual: {
        key: 'nvidia--simready-assets--Pack--aaaaaaaaaaaa',
        node: 'body',
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      },
    },
  };
  const bytes = Buffer.from(
    JSON.stringify({ format: 'basecase-scene', version: 1, scene: { name: 'Shared mug', parts: [part] } }),
  ).toString('base64');

  let finishDownload = () => {};
  const downloadFinished = new Promise<void>((resolve) => {
    finishDownload = resolve;
  });
  const fetches = () => app.requests.filter((url) => url.endsWith('/api/bridge/simready-fetch'));

  try {
    await app.page.route('**/api/bridge/simready-file', (route) => route.fulfill({ json: { data: null } }));
    await app.page.route('**/api/bridge/simready-fetch', async (route) => {
      await downloadFinished;
      await route.fulfill({ status: 503, json: { error: 'Offline' } });
    });
    await app.page.evaluate(async (base64) => {
      const studio = (
        window as unknown as {
          __studio: {
            dropFiles: (files: { name: string; base64: string }[]) => Promise<void>;
            select: (ids: string[]) => void;
          };
        }
      ).__studio;

      await studio.dropFiles([{ name: 'shared.basecase', base64 }]);
    }, bytes);
    await app.page.waitForFunction(() =>
      (window as unknown as { __studio: { sceneRecord: () => { parts: { id: string }[] } } }).__studio
        .sceneRecord()
        .parts.some((part) => part.id === 'shared-mug'),
    );
    await app.page.evaluate(() =>
      (window as unknown as { __studio: { select: (ids: string[]) => void } }).__studio.select(['shared-mug']),
    );

    const download = app.page.getByRole('button', { name: 'Download Textures', exact: true });

    await download.waitFor();
    await narrowTextureInspector(app.page);
    await assertTextureEditingFields(app.page);
    await assertTextureActionLayout(download);
    expect(fetches()).toHaveLength(0);
    expect(app.errors).toEqual([]);
    await download.click();
    await expect.poll(() => fetches().length).toBe(1);
    await expect.poll(() => download.isDisabled()).toBe(true);
    await assertTextureActionLayout(download);
    finishDownload();
    await app.page.getByText('Couldn’t download textures.', { exact: true }).waitFor();
    await expect.poll(() => download.isEnabled()).toBe(true);
    expect(fetches()).toHaveLength(1);

    const downloadUrl = new URL('/api/bridge/simready-fetch', app.page.url()).href;

    expect(app.errors).toEqual([
      `Failed to load resource: the server responded with a status of 503 (Service Unavailable) (${downloadUrl})`,
    ]);

    await app.page.keyboard.press('Meta+k');

    const search = app.page.getByRole('textbox', { name: 'Search commands', exact: true });

    await search.fill('Download Textures');
    await app.page.locator('button[data-idx="0"]').filter({ hasText: 'Download Textures' }).waitFor();
    await search.press('Enter');
    await expect.poll(() => fetches().length).toBe(2);
    await app.page.getByText('Couldn’t download textures.', { exact: true }).waitFor();
    await expect.poll(() => download.isEnabled()).toBe(true);
    expect(app.errors).toEqual(Array(2).fill(app.errors[0]));
  } finally {
    finishDownload();
    await app.close();
    await closeScenes();
  }
});
