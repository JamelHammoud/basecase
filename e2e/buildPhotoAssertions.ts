import { expect } from 'vitest';
import type { Page } from 'playwright-core';

export async function photoLayout(page: Page) {
  const bounds = await page.locator('[data-frozen-build]').evaluate((root) => {
    const rect = (element: Element | Range) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();

      return { left, right, top, bottom, width, height };
    };
    const bar = root.querySelector('[data-build-along-bar]')!;
    const toolbar = bar.querySelector('[role="toolbar"]')!;
    const photos = root.querySelector('[data-build-photos]');
    const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
    const labels = [];
    let node = walker.nextNode();

    while (node) {
      const owner = node.parentElement?.closest('button, li');

      if (node.textContent?.trim() && owner) {
        const range = document.createRange();

        range.selectNodeContents(node);
        labels.push({ text: rect(range), owner: rect(owner) });
      }

      node = walker.nextNode();
    }

    return {
      root: rect(root),
      bar: rect(bar),
      canvas: rect(root.querySelector('canvas')!),
      photos: photos && rect(photos),
      photoControls: [...root.querySelectorAll('[data-build-photos] button')].map(rect),
      controls: [...toolbar.querySelectorAll('button')].map(rect),
      order: [...toolbar.querySelectorAll('button')].map((button) => button.textContent?.trim()),
      thumbnails: [...root.querySelectorAll('[data-build-photos] button img')].map((image) => ({
        image: rect(image),
        button: rect(image.closest('button')!),
      })),
      labels,
    };
  });

  expect(bounds.order.indexOf('Complete Step')).toBeLessThan(bounds.order.indexOf('Import Photos'));

  for (const control of bounds.controls) {
    expect(control.height).toBeGreaterThanOrEqual(32);
    expect(control.left).toBeGreaterThanOrEqual(bounds.root.left);
    expect(control.right).toBeLessThanOrEqual(bounds.root.right);
  }

  for (const { text, owner } of bounds.labels) {
    expect(text.left).toBeGreaterThanOrEqual(owner.left);
    expect(text.right).toBeLessThanOrEqual(owner.right);
    expect(text.top).toBeGreaterThanOrEqual(owner.top);
    expect(text.bottom).toBeLessThanOrEqual(owner.bottom);
    expect(owner.left).toBeGreaterThanOrEqual(bounds.root.left);
    expect(owner.right).toBeLessThanOrEqual(bounds.root.right);
  }

  expect(bounds.canvas.top).toBeGreaterThanOrEqual(bounds.bar.bottom);
  expect(bounds.canvas.width).toBeGreaterThan(0);

  if (bounds.photos) {
    expect(bounds.photos.top).toBeGreaterThanOrEqual(bounds.bar.bottom);
    expect(bounds.canvas.right).toBeLessThanOrEqual(bounds.photos.left);
    expect(bounds.photos.right).toBeLessThanOrEqual(bounds.root.right);

    for (const control of bounds.photoControls) {
      expect(control.height).toBeGreaterThanOrEqual(32);
      expect(control.left).toBeGreaterThanOrEqual(bounds.photos.left);
      expect(control.right).toBeLessThanOrEqual(bounds.photos.right);
      expect(control.bottom).toBeLessThanOrEqual(bounds.photos.bottom);
    }
  }

  for (const { image, button } of bounds.thumbnails) {
    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.top).toBeGreaterThanOrEqual(button.top);
    expect(image.bottom).toBeLessThanOrEqual(button.bottom);
    expect(image.left).toBeGreaterThanOrEqual(button.left);
    expect(image.right).toBeLessThanOrEqual(button.right);
  }
}

export async function damageBuildPhoto(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('basecase-builds', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('builds', 'readwrite');
          const store = transaction.objectStore('builds');
          const cursor = store.openCursor();

          cursor.onsuccess = () => {
            const row = cursor.result;

            if (!row) return;

            if (String(row.key).startsWith('photo:')) row.update({ ...row.value, original: new Blob(['damaged']) });

            row.continue();
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
}
