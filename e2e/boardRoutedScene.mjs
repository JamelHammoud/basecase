import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SceneLibrary } from '../electron/library/sceneLibrary.mjs';

export async function routedSceneBackend(page) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'basecase-routed-scenes-'));
  const scenesDir = path.join(root, 'scenes');

  await fs.mkdir(scenesDir);

  const library = new SceneLibrary({ scenesDir, cacheFile: path.join(root, 'summaries.json') });

  await page.route(/\/api\/bridge\/(scene|scenes|save-scene)(\?|$)/u, async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);
    let result;

    if (name === 'save-scene') result = library.save(route.request().postDataJSON());
    else if (name === 'scene') result = library.get(url.searchParams.get('id'));
    else result = library.list();

    await route.fulfill({ json: result ?? null });
  });

  return () => fs.rm(root, { recursive: true, force: true });
}
