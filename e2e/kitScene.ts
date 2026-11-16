import type { Page } from 'playwright-core';
import type { kitArmScene } from '../src/kit/entry.fixtures';
import type { SavedSceneRecord } from '../src/types/robotics';

function seedKitScene(record: SavedSceneRecord) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('basecase', 3);

    request.onupgradeneeded = () => request.result.createObjectStore('scenes');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('scenes', 'readwrite');

      transaction.objectStore('scenes').put(record, record.id);
      transaction.oncomplete = () => {
        localStorage.setItem('open-scenes', JSON.stringify({ ids: [record.id], tabIds: ['kit'], active: 0 }));
        db.close();
        resolve();
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

export async function openKitScene(page: Page, scene: ReturnType<typeof kitArmScene>, webUrl?: string) {
  if (!webUrl) {
    await page.evaluate(
      (record) => (window as unknown as { __studio: { load: (record: unknown) => void } }).__studio.load(record),
      scene,
    );

    return;
  }

  await page.route('**/__kit-seed', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(`${webUrl}/__kit-seed`);
  await page.evaluate(seedKitScene, {
    ...scene,
    id: 'kit-arm',
    globalGoal: '',
    annotations: [],
    partCount: scene.parts.length,
    updatedAt: '2026-11-16T00:00:00.000Z',
  });
  await page.goto(webUrl);
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
}
