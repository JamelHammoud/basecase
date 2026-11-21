import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { cradleStory } from './cradle.helpers';

let app: App;

beforeAll(async () => {
  app = await openApp();
});
afterAll(async () => {
  await app?.close();
});

it('makes a cradle from Build Along, downloads its actual 3MF and returns without changing the robot', async () => {
  await cradleStory(app);
  expect(app.errors).toEqual([]);
});
