import type { Page } from 'playwright-core';
import type { VersionedSceneRecord } from '../src/types/sceneHistory';

export async function seedVersionProfile(page: Page, origin: string, scenes: VersionedSceneRecord[] = []) {
  await page.route('**/__version-profile', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  );
  await page.goto(`${origin}/__version-profile`);
  await page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('basecase', 3);

        request.onupgradeneeded = () => request.result.createObjectStore('scenes');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('scenes', 'readwrite');
          const ids: string[] = [];

          transaction.objectStore('scenes').put(
            {
              id: 'bootstrap',
              name: 'Bootstrap',
              globalGoal: '',
              updatedAt: '2026-11-16',
              parts: [],
              annotations: [],
              partCount: 0,
            },
            'bootstrap',
          );

          for (const record of records) {
            transaction.objectStore('scenes').put(record, record.id);
            ids.push(record.id);
          }

          transaction.oncomplete = () => {
            db.close();

            if (records.length) localStorage.setItem('open-scenes', JSON.stringify({ ids, active: 0 }));

            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
    scenes,
  );
}
