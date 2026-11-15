import { expect, inject, it } from 'vitest';
import { exposeTestHooks, launchChrome, shown } from './harness';

function seedScenes() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('basecase', 3);

    request.onupgradeneeded = () => request.result.createObjectStore('scenes');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('scenes', 'readwrite');

      for (const id of ['arm', 'rover']) {
        transaction.objectStore('scenes').put(
          {
            id,
            name: id,
            globalGoal: '',
            updatedAt: '2026-11-01T00:00:00.000Z',
            parts: [],
            partCount: 0,
            project: { notes: 'Preserve the complete record' },
          },
          id,
        );
      }

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onabort = () => reject(transaction.error);
    };
  });
}

function storedScenes() {
  return new Promise<{ version: number; records: unknown[]; summaries: unknown[] }>((resolve, reject) => {
    const request = indexedDB.open('basecase');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['scenes', 'sceneSummaries']);
      const records = transaction.objectStore('scenes').getAll();
      const summaries = transaction.objectStore('sceneSummaries').getAll();

      transaction.oncomplete = () => {
        resolve({ version: db.version, records: records.result, summaries: summaries.result });
        db.close();
      };
      transaction.onabort = () => reject(transaction.error);
    };
  });
}

it('keeps the existing browser scenes through the summary-store upgrade', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage();
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.route('**/__seed', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto(`${inject('webUrl')}/__seed`);
    await page.evaluate(seedScenes);
    await exposeTestHooks(page);
    await page.goto(inject('webUrl'));
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await page.locator(shown('button[aria-label="Scenes"]')).first().click();
    await expect.poll(() => page.locator('[data-scene-row]').count()).toBe(2);

    const stored = await page.evaluate(storedScenes);

    expect(stored.version).toBe(4);
    expect(stored.records).toHaveLength(2);
    expect(stored.summaries).toHaveLength(2);

    for (const [at, id] of ['arm', 'rover'].entries()) {
      expect(stored.records[at]).toMatchObject({ id, project: { notes: 'Preserve the complete record' } });
      expect(stored.summaries[at]).toEqual({
        id,
        name: id,
        globalGoal: '',
        updatedAt: '2026-11-01T00:00:00.000Z',
        partCount: 0,
        catalogCount: 0,
        commentCount: 0,
        previewDataUrl: undefined,
        sizeMm: undefined,
      });
    }

    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
