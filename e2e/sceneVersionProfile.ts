import type { Page } from 'playwright-core';

export async function seedVersionProfile(page: Page, origin: string) {
  await page.route('**/__version-profile', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  );
  await page.goto(`${origin}/__version-profile`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('basecase', 3);

        request.onupgradeneeded = () => request.result.createObjectStore('scenes');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('scenes', 'readwrite');

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
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
      }),
  );
}
