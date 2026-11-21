import type { Page } from 'playwright-core';
import type { SavedSceneRecord } from '../src/types/robotics';
import type { App } from './harness';

export async function contactCommand(app: App, name: string) {
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByPlaceholder('Search commands').fill(name);
  await app.page.locator('button[data-idx]').filter({ hasText: name }).first().click();
}

export async function retainSelfContactSceneFiles(page: Page) {
  const saved = new Map<string, SavedSceneRecord>();

  await page.route(/\/api\/bridge\/(scene|scenes|save-scene)(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);

    if (name === 'save-scene') {
      const scene = route.request().postDataJSON() as SavedSceneRecord;

      saved.set(scene.id, { ...scene, updatedAt: new Date().toISOString(), partCount: scene.parts.length });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved.get(scene.id)) });

      return;
    }

    const result = name === 'scene' ? saved.get(url.searchParams.get('id') ?? '') : [...saved.values()];

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result ?? null) });
  });
}
