import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { box } from '../src/sim/fixtures/parts';
import type { ScenePart } from '../src/types/robotics';
import { exposeTestHooks, launchChrome, shown } from './harness';
import { seedVersionProfile } from './sceneVersionProfile';
import type { Page } from 'playwright-core';

let app: { page: Page; errors: string[]; close: () => Promise<void> };

interface Studio {
  load: (scene: { id?: string; name: string; parts: ScenePart[] }) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[] };
}

const parts = [box('cover-a', [0, 20, 0], [40, 40, 40], 30), box('cover-b', [60, 20, 0], [40, 40, 40], 30)].map(
  (part) => ({ ...part, mechanicalTag: '3D Printed PLA/PETG' }),
);
const sceneParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);

beforeAll(async () => {
  const browser = await launchChrome();
  const page = await browser.newPage();
  const errors: string[] = [];

  app = { page, errors, close: () => browser.close() };
  page.on('pageerror', (error) => errors.push(error.message));
  await exposeTestHooks(page);
  await seedVersionProfile(page, inject('webUrl'));
  await page.goto(inject('webUrl'));
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));
}, 120000);

afterAll(async () => app?.close());

it('finishes two parts, imports a local texture, changes scale and reloads the saved scene', async () => {
  await app.page.evaluate((items) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ id: 'appearance-robot', name: 'Textured covers', parts: items });
  }, parts);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
  await app.page.getByText('cover-a', { exact: true }).first().click();
  await app.page
    .getByText('cover-b', { exact: true })
    .first()
    .click({ modifiers: ['Shift'] });
  await app.page.getByRole('tab', { name: 'Inspect', exact: true }).first().click();
  await app.page.getByLabel('Finish', { exact: true }).selectOption('paint');
  await expect
    .poll(async () => (await sceneParts()).every((part) => Math.abs((part.appearance?.roughness ?? 0) - 0.3) < 1e-6))
    .toBe(true);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMomm/2H4QZYAwAT24JGQ7yLkAAAAAASUVORK5CYII=',
    'base64',
  );

  let release: () => void = () => {};
  let requested: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const workerPath = /\/texture\.worker[.-]/;

  await app.page.context().route(workerPath, async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  await app.page
    .getByLabel('Base color texture', { exact: true })
    .setInputFiles({ name: 'paint.png', mimeType: 'image/png', buffer: png });
  await waiting;
  await app.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  release();
  await app.page.context().unroute(workerPath);
  expect((await sceneParts()).every((part) => !part.appearance?.textures)).toBe(true);
  await app.page
    .getByLabel('Base color texture', { exact: true })
    .setInputFiles({ name: 'paint.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => (await sceneParts())[0].appearance?.textures?.baseColor).toMatch(/^[a-f0-9]{64}$/);

  const scale = app.page.getByRole('textbox', { name: 'Texture scale', exact: true });

  await scale.fill('25');
  await scale.press('Enter');
  await scale.blur();
  await expect.poll(async () => (await sceneParts())[0].appearance?.mapping.scale).toBe(25);
  await app.page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(async () => (await sceneParts())[0].appearance?.mapping.scale).toBe(10);
  await app.page.getByRole('button', { name: /^Redo/ }).click();
  await expect.poll(async () => (await sceneParts())[0].appearance?.mapping.scale).toBe(25);

  const finished = await sceneParts();

  await app.page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() =>
      app.page.evaluate(
        () =>
          new Promise<ScenePart[]>((resolve, reject) => {
            const opening = indexedDB.open('basecase');

            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const database = opening.result;
              const reading = database.transaction('scenes', 'readonly').objectStore('scenes').get('appearance-robot');

              reading.onsuccess = () => {
                database.close();
                resolve(reading.result?.parts ?? []);
              };
              reading.onerror = () => {
                database.close();
                reject(reading.error);
              };
            };
          }),
      ),
    )
    .toEqual(finished);
  await app.page.reload();
  await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));
  await expect.poll(sceneParts).toEqual(finished);

  expect(finished.map(({ id, mechanicalTag, massG }) => ({ id, mechanicalTag, massG }))).toEqual(
    parts.map(({ id, mechanicalTag, massG }) => ({ id, mechanicalTag, massG })),
  );
  expect(app.errors).toEqual([]);
});
